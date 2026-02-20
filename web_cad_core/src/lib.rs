use eframe::egui;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct WebCadApp {
    tool: String,
    scale: f32,
    cube_visible: bool,
    rotation_x: f32,
    rotation_y: f32,
}

impl Default for WebCadApp {
    fn default() -> Self {
        Self {
            tool: "select".to_string(),
            scale: 1.0,
            cube_visible: true,
            rotation_x: 0.5,
            rotation_y: 0.5,
        }
    }
}

impl eframe::App for WebCadApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        // Main canvas interaction area
        egui::CentralPanel::default()
            .frame(egui::Frame::none().fill(egui::Color32::TRANSPARENT))
            .show(ctx, |ui| {
            
            // Allocate the entire canvas drag space
            let (rect, response) = ui.allocate_exact_size(ui.available_size(), egui::Sense::drag());
            
            if response.dragged() {
                self.rotation_y += response.drag_delta().x * 0.01;
                self.rotation_x += response.drag_delta().y * 0.01;
                ctx.request_repaint(); // Redraw on move
            }

            if self.cube_visible {
                let center = rect.center();
                let size = 150.0 * self.scale;

                // Simple 3D vertices of a cube
                let vertices = [
                    [-1.0, -1.0, -1.0], [ 1.0, -1.0, -1.0], [ 1.0,  1.0, -1.0], [-1.0,  1.0, -1.0],
                    [-1.0, -1.0,  1.0], [ 1.0, -1.0,  1.0], [ 1.0,  1.0,  1.0], [-1.0,  1.0,  1.0],
                ];

                let cx = self.rotation_x.cos();
                let sx = self.rotation_x.sin();
                let cy = self.rotation_y.cos();
                let sy = self.rotation_y.sin();

                let mut projected = Vec::new();
                for v in &vertices {
                    // Rotate Y
                    let x1 = v[0] * cy - v[2] * sy;
                    let z1 = v[0] * sy + v[2] * cy;
                    // Rotate X
                    let y2 = v[1] * cx - z1 * sx;
                    // let z2 = v[1] * sx + z1 * cx; // Z depth not strictly needed for ortho
                    
                    let px = center.x + x1 * size;
                    let py = center.y + y2 * size;
                    projected.push(egui::pos2(px, py));
                }

                let edges = [
                    (0, 1), (1, 2), (2, 3), (3, 0), // Front plane
                    (4, 5), (5, 6), (6, 7), (7, 4), // Back plane
                    (0, 4), (1, 5), (2, 6), (3, 7), // Connection lines
                ];

                let painter = ui.painter();
                for &(i, j) in &edges {
                    painter.line_segment(
                        [projected[i], projected[j]],
                        egui::Stroke::new(2.0, egui::Color32::from_rgb(139, 92, 246)), // Violet Accent
                    );
                }
            }
        });

        // Move Rust widgets out of the way of the HTML sidebar (top-left is blocked)
        egui::Window::new("Rust CAD Properties")
            .default_pos(egui::pos2(260.0, 90.0))
            .show(ctx, |ui| {
                ui.label(format!("Active Tool HTML Sync: {}", self.tool));
                
                ui.horizontal(|ui| {
                    ui.label("Scale:");
                    ui.add(egui::Slider::new(&mut self.scale, 0.1..=5.0));
                });

                ui.checkbox(&mut self.cube_visible, "Show 3D Cube Widget");
            });
    }
}

/// This is the entry-point called from JavaScript after the WebAssembly is loaded.
#[wasm_bindgen(start)]
pub async fn start() -> Result<(), wasm_bindgen::JsValue> {
    console_error_panic_hook::set_once();

    let web_options = eframe::WebOptions::default();

    // Spawn the `eframe` WebRunner
    eframe::WebRunner::new()
        .start(
            "cad-canvas", 
            web_options,
            Box::new(|_cc| Box::new(WebCadApp::default())),
        )
        .await?;

    Ok(())
}

/// A custom function exported to JavaScript to change tools from the frontend HTML UI
#[wasm_bindgen]
pub fn set_active_tool(tool_name: &str) {
    web_sys::console::log_1(&format!("Rust WASM received tool change: {}", tool_name).into());
    // In a real app we'd dispatch this event to our App state globally or via channels
}
