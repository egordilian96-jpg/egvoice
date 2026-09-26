#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{fs, io::Write, path::PathBuf, time::SystemTime};

fn log_path() -> PathBuf {
    std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir)
        .join("EG Voice")
        .join("logs")
        .join("startup.log")
}

fn log_startup(message: &str) {
    let path = log_path();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(mut file) = fs::OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "{:?} {message}", SystemTime::now());
    }
}

fn show_startup_error(message: &str) {
    log_startup(message);
    #[cfg(windows)]
    {
        #[link(name = "user32")]
        extern "system" {
            fn MessageBoxW(
                hwnd: *mut std::ffi::c_void,
                text: *const u16,
                caption: *const u16,
                kind: u32,
            ) -> i32;
        }
        let text: Vec<u16> = format!(
            "Не удалось запустить EG Voice.\n\n{message}\n\nЖурнал ошибки:\n{}",
            log_path().display()
        ).encode_utf16().chain(Some(0)).collect();
        let caption: Vec<u16> = "EG Voice: ошибка запуска".encode_utf16().chain(Some(0)).collect();
        // Both buffers are NUL-terminated and live until MessageBoxW returns.
        unsafe { MessageBoxW(std::ptr::null_mut(), text.as_ptr(), caption.as_ptr(), 0x10); }
    }
}

#[tauri::command]
fn frontend_ready() {
    // Fixed marker only: no account, token, message or microphone information.
    log_startup("frontend-ready");
}

fn main() {
    let path = log_path();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let _ = fs::write(path, "");
    log_startup(concat!("starting EG Voice ", env!("CARGO_PKG_VERSION")));
    std::panic::set_hook(Box::new(|info| {
        show_startup_error(&format!("Native panic: {info}"));
    }));

    // Automatic updates are not configured yet. Registering the updater without
    // plugins.updater.pubkey aborts Tauri initialization before any window opens.
    let result = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![frontend_ready])
        .setup(|_app| {
            log_startup("native-setup-ready");
            Ok(())
        })
        .on_page_load(|_webview, _payload| log_startup("webview-page-load"))
        .build(tauri::generate_context!());

    match result {
        Ok(app) => {
            log_startup("native-build-ready");
            app.run(|_app, event| {
                if matches!(event, tauri::RunEvent::Ready) {
                    log_startup("event-loop-ready");
                }
            });
        }
        Err(error) => {
            show_startup_error(&format!("Tauri initialization: {error}"));
            std::process::exit(1);
        }
    }
}
