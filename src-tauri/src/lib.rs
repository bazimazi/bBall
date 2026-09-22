//! The native shell around the bBall web build.
//!
//! There is deliberately almost nothing here. The game is the same TypeScript
//! that runs in a browser; this crate exists to give it a window, an icon, an
//! installer per operating system, and the three things a packaged app needs
//! that a tab does not:
//!
//! - **A URL scheme.** `bball://oauth?...` is how a social sign-in gets back
//!   into the app after the system browser has finished with it. A webview
//!   cannot receive a provider redirect itself - providers refuse to render in
//!   one - so the round trip leaves the app entirely and returns by scheme.
//! - **One instance.** A second launch (which is what the operating system
//!   does when it opens a `bball://` link on Windows and Linux) must hand its
//!   arguments to the running game and exit, rather than starting a second
//!   copy with a second set of save files.
//! - **A way out.** `opener` sends a URL to the user's real browser instead of
//!   navigating the game's own webview away from the app.

use tauri::Manager;

/// Build and run the app.
///
/// `mobile_entry_point` is what `tauri android dev` and `tauri ios dev` call;
/// on desktop this is called from `main.rs` instead.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // Registered before every other plugin on purpose: the single-instance
    // callback runs in the first process, and the deep-link integration hands
    // the second process's arguments over to it. Registering it later means a
    // `bball://` link opened while the game is running is simply lost.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            // Whatever the second launch was for, the player is looking for a
            // window, so put the one that exists in front of them.
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }));
    }

    builder
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .setup(|_app| {
            // macOS and iOS bind the scheme from the bundle's Info.plist, and
            // a packaged Windows or Linux build gets it from the installer.
            // Only an unpackaged dev run has nothing registered, so that is
            // the only case that registers at runtime - doing it in release
            // would let a development build steal the scheme from an
            // installed one.
            #[cfg(all(debug_assertions, any(windows, target_os = "linux")))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                if let Err(error) = _app.deep_link().register_all() {
                    // Not fatal: everything except social sign-in still works.
                    eprintln!("bball: could not register the bball:// scheme: {error}");
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("bball: failed to start the app");
}
