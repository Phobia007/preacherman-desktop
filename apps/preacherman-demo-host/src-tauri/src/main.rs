#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(target_os = "windows")]
use tauri_plugin_shell::ShellExt;
use tauri::Manager;
use tauri_plugin_deep_link::DeepLinkExt;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Portable Windows releases also need an OS handler for browser sign-in.
            // The canonical shortcut always launches the executable at its deployed path.
            #[cfg(any(windows, target_os = "linux"))]
            if let Err(_error) = app.deep_link().register_all() {
                eprintln!("Could not register the Preacherman sign-in callback.");
            }
            #[cfg(all(target_os = "windows", not(debug_assertions)))]
            {
                let (_events, _child) = app
                    .shell()
                    .sidecar("preacherman-service")
                    .expect("Windows Agent service sidecar is missing")
                    .spawn()?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Preacherman Desktop Demo");
}
