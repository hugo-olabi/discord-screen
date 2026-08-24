import os
import random
import string
import sys

try:
    import gi
    gi.require_version('Gio', '2.0')
    gi.require_version('GLib', '2.0')
    from gi.repository import Gio, GLib
except ImportError:
    pass

# Retain global reference for DBus session to prevent garbage collection closure
_ACTIVE_PORTAL_SESSION = None

def _get_random_token() -> str:
    return 'ds_' + ''.join(random.choices(string.ascii_letters + string.digits, k=10))

def close_active_portal_session():
    """Closes the currently active Portal DBus session and file descriptors."""
    global _ACTIVE_PORTAL_SESSION
    if _ACTIVE_PORTAL_SESSION:
        try:
            fd = _ACTIVE_PORTAL_SESSION.get('fd')
            if fd is not None:
                try: os.close(fd)
                except Exception: pass
            session_handle = _ACTIVE_PORTAL_SESSION.get('session_handle')
            proxy = _ACTIVE_PORTAL_SESSION.get('proxy')
            if session_handle and proxy:
                proxy.call_sync('Close', GLib.Variant('(o)', [session_handle]), Gio.DBusCallFlags.NONE, -1, None)
        except Exception:
            pass
        _ACTIVE_PORTAL_SESSION = None

def get_pipewire_fd_and_node(timeout_seconds: int = 60) -> tuple[str | None, int | None, bool]:
    """
    Requests screen or window capture via XDG Desktop Portal (org.freedesktop.portal.ScreenCast).
    Returns (node_id, pipewire_fd, is_screen).
    """
    is_screen = True

    global _ACTIVE_PORTAL_SESSION
    close_active_portal_session()

    try:
        bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
    except Exception as e:
        sys.stderr.write(f"DBus connection error: {e}\n")
        return None, None, True

    try:
        screencast_proxy = Gio.DBusProxy.new_sync(
            bus,
            Gio.DBusProxyFlags.NONE,
            None,
            'org.freedesktop.portal.Desktop',
            '/org/freedesktop/portal/desktop',
            'org.freedesktop.portal.ScreenCast',
            None
        )
    except Exception as e:
        sys.stderr.write(f"ScreenCast Portal proxy creation error: {e}\n")
        return None, None, True

    loop = GLib.MainLoop()
    session_handle = None
    node_id = None
    step = 'create_session'

    def on_portal_response(connection, sender_name, object_path, interface_name, signal_name, parameters, user_data):
        nonlocal session_handle, node_id, step, is_screen
        if signal_name != 'Response':
            return

        try:
            res_code, results = parameters.unpack()
            if res_code != 0:
                loop.quit()
                return

            if step == 'create_session' and 'session_handle' in results:
                session_handle = results['session_handle']
                step = 'select_sources'
                do_select_sources()

            elif step == 'select_sources':
                step = 'start'
                do_start()

            elif step == 'start':
                if 'streams' in results and len(results['streams']) > 0:
                    stream_info = results['streams'][0]
                    node_id = str(stream_info[0])
                    if len(stream_info) > 1 and isinstance(stream_info[1], dict):
                        st = stream_info[1].get('source_type')
                        if st is not None:
                            is_screen = (st == 1)
                loop.quit()
        except Exception as err:
            sys.stderr.write(f"Error processing Portal response: {err}\n")
            loop.quit()

    bus.signal_subscribe(
        'org.freedesktop.portal.Desktop',
        'org.freedesktop.portal.Request',
        'Response',
        None,
        None,
        Gio.DBusSignalFlags.NONE,
        on_portal_response,
        None
    )

    def do_create_session():
        token = _get_random_token()
        try:
            screencast_proxy.call_sync(
                'CreateSession',
                GLib.Variant('(a{sv})', [{'session_handle_token': GLib.Variant('s', token)}]),
                Gio.DBusCallFlags.NONE,
                -1,
                None
            )
        except Exception as e:
            sys.stderr.write(f"CreateSession error: {e}\n")
            loop.quit()

    def do_select_sources():
        token = _get_random_token()
        try:
            screencast_proxy.call_sync(
                'SelectSources',
                GLib.Variant('(oa{sv})', [
                    session_handle,
                    {
                        'types': GLib.Variant('u', 3), # 1=Monitor, 2=Window, 3=Both
                        'multiple': GLib.Variant('b', False),
                        'cursor_mode': GLib.Variant('u', 2),
                        'handle_token': GLib.Variant('s', token)
                    }
                ]),
                Gio.DBusCallFlags.NONE,
                -1,
                None
            )
        except Exception as e:
            sys.stderr.write(f"SelectSources error: {e}\n")
            loop.quit()

    def do_start():
        token = _get_random_token()
        try:
            screencast_proxy.call_sync(
                'Start',
                GLib.Variant('(osa{sv})', [
                    session_handle,
                    '',
                    {'handle_token': GLib.Variant('s', token)}
                ]),
                Gio.DBusCallFlags.NONE,
                -1,
                None
            )
        except Exception as e:
            sys.stderr.write(f"Start error: {e}\n")
            loop.quit()

    do_create_session()
    GLib.timeout_add_seconds(timeout_seconds, loop.quit)
    loop.run()

    pw_fd = None
    if node_id and session_handle:
        try:
            res_var, fd_list = screencast_proxy.call_with_unix_fd_list_sync(
                'OpenPipeWireRemote',
                GLib.Variant('(oa{sv})', [session_handle, {}]),
                Gio.DBusCallFlags.NONE,
                -1,
                None,
                None
            )
            if fd_list and fd_list.get_length() > 0:
                raw_fd = fd_list.get(0)
                pw_fd = os.dup(raw_fd)
        except Exception as e:
            sys.stderr.write(f"Warning fetching OpenPipeWireRemote: {e}\n")

        _ACTIVE_PORTAL_SESSION = {
            'bus': bus,
            'proxy': screencast_proxy,
            'session_handle': session_handle,
            'node_id': node_id,
            'fd': pw_fd,
            'is_screen': is_screen
        }

    return node_id, pw_fd, is_screen

def request_xdg_screencast(timeout_seconds: int = 60) -> str | None:
    res = get_pipewire_fd_and_node(timeout_seconds)
    if isinstance(res, tuple) and len(res) >= 2:
        return res[0]
    return None

# Backward compatibility aliases
fechar_sessao_portal_ativa = close_active_portal_session
obter_pipewire_fd_e_node = get_pipewire_fd_and_node
solicitar_xdg_screencast = request_xdg_screencast

if __name__ == '__main__':
    res = get_pipewire_fd_and_node()
    if isinstance(res, tuple) and len(res) >= 2 and res[0]:
        print(f"PIPEWIRE_NODE={res[0]} FD={res[1]}")
        sys.exit(0)
    else:
        sys.exit(1)
