from app import create_app


def main_cli(host: str = "0.0.0.0", port: int = 5000, debug: bool = True):
    """Modo CLI tradicional (útil para desenvolvimento)."""
    app = create_app()
    app.run(host=host, port=port, debug=debug)


def main_gui(default_port: int = 5000):
    """Painel visual para iniciar/parar o servidor e abrir o site."""
    import threading
    import webbrowser
    import socket
    import os
    import subprocess
    from tkinter import Tk, StringVar, IntVar, DISABLED, NORMAL
    from tkinter import ttk, messagebox
    from werkzeug.serving import make_server

    class ServerThread(threading.Thread):
        def __init__(self, app, host: str, port: int):
            super().__init__(daemon=True)
            self._host = host
            self._port = port
            self._server = make_server(host, port, app)
            self._ctx = app.app_context()
            self._ctx.push()

        def run(self):
            self._server.serve_forever()

        def shutdown(self):
            self._server.shutdown()

        @property
        def url(self) -> str:
            return f"http://{self._host}:{self._port}"

    def port_available(port: int) -> bool:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind(("127.0.0.1", port))
            except OSError:
                return False
        return True

    app = create_app()

    root = Tk()
    root.title("QUALIDADE Integração - Painel")
    root.geometry("560x260")
    root.minsize(520, 240)

    style = ttk.Style()
    try:
        style.theme_use('clam')
    except Exception:
        pass
    # Estilos profissionais
    primary = '#0d6efd'
    primary_active = '#0b5ed7'
    danger = '#dc3545'
    danger_active = '#bb2d3b'
    header_bg = '#1e3c72'
    header_sub = '#dbe7ff'

    style.configure('Header.TFrame', background=header_bg)
    style.configure('Header.Title.TLabel', background=header_bg, foreground='white', font=("Segoe UI", 14, 'bold'))
    style.configure('Header.Subtitle.TLabel', background=header_bg, foreground=header_sub, font=("Segoe UI", 9))

    style.configure('Primary.TButton', background=primary, foreground='white', padding=6)
    style.map('Primary.TButton', background=[('active', primary_active), ('disabled', '#6ea8fe')])
    style.configure('Danger.TButton', background=danger, foreground='white', padding=6)
    style.map('Danger.TButton', background=[('active', danger_active), ('disabled', '#f1aeb5')])

    status_var = StringVar(value="Parado")
    url_var = StringVar(value="—")
    port_var = IntVar(value=default_port)
    btn_state = {"server": None}
    server_thread: ServerThread | None = None

    # Header
    header = ttk.Frame(root, style='Header.TFrame', padding=(16, 10))
    header.pack(fill='x')
    title = ttk.Label(header, text="QUALIDADE INTEGRAÇÃO", style='Header.Title.TLabel')
    subtitle = ttk.Label(header, text="Painel do Servidor Local", style='Header.Subtitle.TLabel')
    title.pack(anchor='w')
    subtitle.pack(anchor='w')

    # Separador
    ttk.Separator(root, orient='horizontal').pack(fill='x')

    container = ttk.Frame(root, padding=16)
    container.pack(fill='both', expand=True)

    # Linha de controles
    controls = ttk.Frame(container)
    controls.grid(row=2, column=0, sticky='ew', pady=(8, 8))
    controls.columnconfigure(4, weight=1)

    ttk.Label(controls, text="Porta:").grid(row=0, column=0, padx=(0, 6))
    port_entry = ttk.Spinbox(controls, from_=1024, to=65535, textvariable=port_var, width=8)
    port_entry.grid(row=0, column=1)

    start_btn = ttk.Button(controls, text="Iniciar Servidor", style='Primary.TButton')
    stop_btn = ttk.Button(controls, text="Parar", state=DISABLED, style='Danger.TButton')
    open_btn = ttk.Button(controls, text="Abrir no Navegador", state=DISABLED, style='Primary.TButton')
    start_btn.grid(row=0, column=2, padx=8)
    stop_btn.grid(row=0, column=3)
    open_btn.grid(row=0, column=5, padx=(8, 0))

    # Status
    status_frame = ttk.Frame(container)
    status_frame.grid(row=3, column=0, sticky='ew')
    ttk.Label(status_frame, text="Status:").grid(row=0, column=0, sticky='w')
    status_dot = ttk.Label(status_frame, text="●", foreground=danger)
    status_dot.grid(row=0, column=1, padx=(6, 0))
    status_label = ttk.Label(status_frame, textvariable=status_var, font=("Segoe UI", 10, "bold"))
    status_label.grid(row=0, column=2, padx=(6, 0))

    ttk.Label(status_frame, text="URL:").grid(row=1, column=0, sticky='w', pady=(6, 0))
    url_label = ttk.Label(status_frame, textvariable=url_var, foreground=primary)
    url_label.grid(row=1, column=1, columnspan=2, padx=(6, 0), pady=(6, 0), sticky='w')

    copy_btn = ttk.Button(status_frame, text="Copiar URL", style='Primary.TButton')
    copy_btn.grid(row=1, column=3, padx=(8, 0), pady=(6, 0), sticky='w')

    folder_btn = ttk.Button(status_frame, text="Abrir pasta do banco")
    folder_btn.grid(row=1, column=4, padx=(8, 0), pady=(6, 0), sticky='w')
    url_label.bind('<Button-1>', lambda e: on_open())
    url_label.configure(cursor='hand2')

    def set_running(running: bool, url: str | None = None):
        status_var.set("Rodando" if running else "Parado")
        if url:
            url_var.set(url)
        open_btn.config(state=NORMAL if running else DISABLED)
        stop_btn.config(state=NORMAL if running else DISABLED)
        start_btn.config(state=DISABLED if running else NORMAL)
        port_entry.config(state=DISABLED if running else NORMAL)
        status_dot.config(foreground=primary if running else danger)

    def on_start():
        nonlocal server_thread
        port = int(port_var.get())
        if not port_available(port):
            messagebox.showerror("Porta ocupada", f"A porta {port} já está em uso. Escolha outra.")
            return
        try:
            server_thread = ServerThread(app, host="127.0.0.1", port=port)
            server_thread.start()
            set_running(True, server_thread.url)
        except Exception as e:
            server_thread = None
            messagebox.showerror("Erro ao iniciar", str(e))

    def on_stop():
        nonlocal server_thread
        if server_thread is not None:
            try:
                server_thread.shutdown()
            except Exception:
                pass
            server_thread = None
        set_running(False, "—")

    def on_open():
        if server_thread is not None:
            webbrowser.open(server_thread.url)

    def on_copy_url():
        url = url_var.get().strip()
        if url and url != '—':
            try:
                root.clipboard_clear()
                root.clipboard_append(url)
                root.update()
                messagebox.showinfo("Copiado", "URL copiada para a área de transferência.")
            except Exception as e:
                messagebox.showerror("Erro", f"Não foi possível copiar: {e}")

    def on_open_instance():
        try:
            path = app.instance_path
            os.makedirs(path, exist_ok=True)
            if os.name == 'nt':
                os.startfile(path)  # type: ignore[attr-defined]
            elif sys.platform == 'darwin':
                subprocess.Popen(['open', path])
            else:
                subprocess.Popen(['xdg-open', path])
        except Exception as e:
            messagebox.showerror("Erro", f"Não foi possível abrir a pasta: {e}")

    def on_close():
        try:
            on_stop()
        finally:
            root.destroy()

    start_btn.config(command=on_start)
    stop_btn.config(command=on_stop)
    open_btn.config(command=on_open)
    copy_btn.config(command=on_copy_url)
    folder_btn.config(command=on_open_instance)
    root.protocol("WM_DELETE_WINDOW", on_close)

    root.mainloop()


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="QUALIDADE Integração - Servidor")
    parser.add_argument("--cli", action="store_true", help="Rodar no modo console tradicional")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=5000)
    parser.add_argument("--debug", action="store_true")
    args = parser.parse_args()

    if args.cli:
        main_cli(host=args.host, port=args.port, debug=args.debug)
    else:
        main_gui(default_port=args.port)
