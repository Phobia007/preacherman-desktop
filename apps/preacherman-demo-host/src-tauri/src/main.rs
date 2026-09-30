#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(any(target_os = "windows", target_os = "macos"))]
use tauri_plugin_shell::ShellExt;
use tauri::Manager;
#[cfg(any(windows, target_os = "linux"))]
use tauri_plugin_deep_link::DeepLinkExt;

mod auth_return;

#[cfg(all(any(target_os = "windows", target_os = "macos"), not(debug_assertions)))]
#[derive(Default)]
struct ServiceProcess(std::sync::Mutex<Option<tauri_plugin_shell::process::CommandChild>>);

fn main() {
    tauri::Builder::default()
        .manage(auth_return::AuthReturnServer::default())
        .invoke_handler(tauri::generate_handler![auth_return::start_auth_return, auth_return::stop_auth_return])
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
            #[cfg(all(any(target_os = "windows", target_os = "macos"), not(debug_assertions)))]
            {
                let (mut events, child) = app
                    .shell()
                    .sidecar("preacherman-service")
                    .expect("Agent service sidecar is missing")
                    .spawn()?;
                app.manage(ServiceProcess(std::sync::Mutex::new(Some(child))));
                // Drain the bounded channel for the lifetime of the service.
                tauri::async_runtime::spawn(async move {
                    while events.recv().await.is_some() {}
                });
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Preacherman Desktop Demo")
        .run(|app, event| {
            #[cfg(all(any(target_os = "windows", target_os = "macos"), not(debug_assertions)))]
            if matches!(event, tauri::RunEvent::Exit) {
                if let Some(service) = app.try_state::<ServiceProcess>() {
                    if let Some(child) = service.0.lock().unwrap().take() {
                        let _ = child.kill();
                    }
                }
            }
            #[cfg(any(debug_assertions, not(any(target_os = "windows", target_os = "macos"))))]
            let _ = (app, event);
        });
}
