// The windows_subsystem attribute stops a console window from opening behind
// the game in release builds on Windows. It is off in debug so `tauri dev`
// still prints.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    bball_lib::run();
}
