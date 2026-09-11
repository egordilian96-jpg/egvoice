#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|_app| Ok(()))
        .run(tauri::generate_context!())
        .expect("EG Voice: ошибка запуска Tauri-приложения");
}
