use eframe::egui;
use std::sync::Mutex;
use wasm_bindgen::prelude::*;

static ACTIVE_TOOL: Mutex<&'static str> = Mutex::new("select");

#[wasm_bindgen]
pub struct WebCadApp {
    scale: f32,
    cube_visible: bool,
    rotation_x: f32,
    rotation_y: f32,
    trans_x: f32,
    trans_y: f32,
    current_shape: String,
}

impl Default for WebCadApp {
    fn default() -> Self {
        Self {
            scale: 1.0,
            cube_visible: true,
            rotation_x: 0.5,
            rotation_y: 0.5,
            trans_x: 0.0,
            trans_y: 0.0,
            current_shape: "cube".to_string(),
        }
    }
}

impl WebCadApp {
    fn get_geometry(&self) -> (Vec<[f32; 3]>, Vec<(usize, usize)>) {
        match self.current_shape.as_str() {
            "cube" => {
                let vertices = vec![
                    [-1.0, -1.0, -1.0], [ 1.0, -1.0, -1.0], [ 1.0,  1.0, -1.0], [-1.0,  1.0, -1.0],
                    [-1.0, -1.0,  1.0], [ 1.0, -1.0,  1.0], [ 1.0,  1.0,  1.0], [-1.0,  1.0,  1.0],
                ];
                let edges = vec![
                    (0, 1), (1, 2), (2, 3), (3, 0),
                    (4, 5), (5, 6), (6, 7), (7, 4),
                    (0, 4), (1, 5), (2, 6), (3, 7),
                ];
                (vertices, edges)
            },
            "cylinder" => {
                let mut vertices = Vec::new();
                let mut edges = Vec::new();
                let segments = 16;
                for i in 0..segments {
                    let angle = i as f32 * std::f32::consts::PI * 2.0 / segments as f32;
                    vertices.push([angle.cos(), -1.0, angle.sin()]);
                }
                for i in 0..segments {
                    let angle = i as f32 * std::f32::consts::PI * 2.0 / segments as f32;
                    vertices.push([angle.cos(), 1.0, angle.sin()]);
                }
                for i in 0..segments {
                    let next = (i + 1) % segments;
                    edges.push((i, next)); 
                    edges.push((i + segments, next + segments)); 
                    edges.push((i, i + segments));
                }
                (vertices, edges)
            },
            "sphere" => {
                let mut vertices = Vec::new();
                let mut edges = Vec::new();
                let rings = 10;
                let segments = 16;
                for i in 0..=rings {
                    let v = i as f32 / rings as f32;
                    let phi = v * std::f32::consts::PI;
                    for j in 0..segments {
                        let u = j as f32 / segments as f32;
                        let theta = u * std::f32::consts::PI * 2.0;

                        let x = phi.sin() * theta.cos();
                        let y = phi.cos();
                        let z = phi.sin() * theta.sin();
                        vertices.push([x, y, z]);
                    }
                }
                
                for i in 0..rings {
                    for j in 0..segments {
                        let current = i * segments + j;
                        let next_j = i * segments + (j + 1) % segments;
                        let next_i = (i + 1) * segments + j;

                        edges.push((current, next_j));
                        if i < rings {
                            edges.push((current, next_i));
                        }
                    }
                }
                (vertices, edges)
            },
            _ => (vec![], vec![])
        }
    }
}

impl eframe::App for WebCadApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        let new_tool = {
            let guard = ACTIVE_TOOL.lock().unwrap();
            *guard
        };
        
        if ["cube", "sphere", "cylinder"].contains(&new_tool) {
            self.current_shape = new_tool.to_string();
        }

        egui::CentralPanel::default()
            .frame(egui::Frame::none().fill(egui::Color32::TRANSPARENT))
            .show(ctx, |ui| {
            
            let (rect, response) = ui.allocate_exact_size(ui.available_size(), egui::Sense::drag());
            
            if response.dragged() {
                match new_tool {
                    "rotate" => {
                        self.rotation_y += response.drag_delta().x * 0.01;
                        self.rotation_x += response.drag_delta().y * 0.01;
                    },
                    "move" => {
                        self.trans_x += response.drag_delta().x;
                        self.trans_y += response.drag_delta().y;
                    },
                    "scale" => {
                        self.scale += response.drag_delta().y * -0.01;
                        self.scale = self.scale.clamp(0.1, 10.0);
                    },
                    _ => {
                        // Default rotate behavior for shape picking or select tool
                        self.rotation_y += response.drag_delta().x * 0.01;
                        self.rotation_x += response.drag_delta().y * 0.01;
                    }
                }
                ctx.request_repaint();
            }

            if self.cube_visible {
                let center = rect.center();
                let size = 150.0 * self.scale;

                let cx = self.rotation_x.cos();
                let sx = self.rotation_x.sin();
                let cy = self.rotation_y.cos();
                let sy = self.rotation_y.sin();

                // World to Screen Projection
                let project = |x: f32, y: f32, z: f32| -> egui::Pos2 {
                    let rx = x * cy - z * sy;
                    let rz = x * sy + z * cy;
                    let ry = y * cx - rz * sx;
                    egui::pos2(center.x + rx * size, center.y + ry * size)
                };

                // World to Screen Projection (with translation for the object)
                let project_object = |x: f32, y: f32, z: f32| -> egui::Pos2 {
                    let rx = x * cy - z * sy;
                    let rz = x * sy + z * cy;
                    let ry = y * cx - rz * sx;
                    egui::pos2(center.x + rx * size + self.trans_x, center.y + ry * size + self.trans_y)
                };

                let painter = ui.painter();

                // Grid (Center)
                let grid_color = egui::Color32::from_rgb(80, 80, 80);
                for i in -5..=5 {
                    let offset = i as f32 * 0.5;
                    painter.line_segment(
                        [project(offset, -1.0, -2.5), project(offset, -1.0, 2.5)],
                        egui::Stroke::new(1.0, grid_color),
                    );
                    painter.line_segment(
                        [project(-2.5, -1.0, offset), project(2.5, -1.0, offset)],
                        egui::Stroke::new(1.0, grid_color),
                    );
                }

                // Axes (Center)
                let origin = project(0.0, -1.0, 0.0);
                painter.line_segment([origin, project(1.5, -1.0, 0.0)], egui::Stroke::new(2.0, egui::Color32::RED));
                painter.line_segment([origin, project(0.0, 0.5, 0.0)], egui::Stroke::new(2.0, egui::Color32::GREEN));
                painter.line_segment([origin, project(0.0, -1.0, 1.5)], egui::Stroke::new(2.0, egui::Color32::from_rgb(50, 100, 255)));

                // Object
                let (vertices, edges) = self.get_geometry();
                let mut projected = Vec::new();
                for v in &vertices {
                    projected.push(project_object(v[0], v[1], v[2]));
                }

                for &(i, j) in &edges {
                    if i < projected.len() && j < projected.len() {
                        painter.line_segment(
                            [projected[i], projected[j]],
                            egui::Stroke::new(2.0, egui::Color32::from_rgb(139, 92, 246)),
                        );
                    }
                }
            }
        });

        egui::Window::new("Rust CAD Properties")
            .default_pos(egui::pos2(260.0, 90.0))
            .show(ctx, |ui| {
                ui.label(format!("Active Tool HTML Sync: {}", new_tool));
                ui.label(format!("Active Shape: {}", self.current_shape));
                ui.label(format!("Position: ({:.1}, {:.1})", self.trans_x, self.trans_y));
                
                ui.horizontal(|ui| {
                    ui.label("Scale:");
                    ui.add(egui::Slider::new(&mut self.scale, 0.1..=10.0));
                });

                if ui.button("Center Object").clicked() {
                    self.trans_x = 0.0;
                    self.trans_y = 0.0;
                }

                ui.checkbox(&mut self.cube_visible, "Show 3D Widget");
            });
    }
}

#[wasm_bindgen(start)]
pub async fn start() -> Result<(), wasm_bindgen::JsValue> {
    console_error_panic_hook::set_once();
    let web_options = eframe::WebOptions::default();

    eframe::WebRunner::new()
        .start(
            "cad-canvas", 
            web_options,
            Box::new(|_cc| Box::new(WebCadApp::default())),
        )
        .await?;

    Ok(())
}

#[wasm_bindgen]
pub fn set_active_tool(tool_name: &str) {
    web_sys::console::log_1(&format!("Rust WASM received tool change: {}", tool_name).into());
    let mut guard = ACTIVE_TOOL.lock().unwrap();
    let static_tool: &'static str = match tool_name {
        "select" => "select",
        "move" => "move",
        "rotate" => "rotate",
        "scale" => "scale",
        "cube" => "cube",
        "sphere" => "sphere",
        "cylinder" => "cylinder",
        "mint" => "mint",
        "export" => "export",
        _ => "unknown"
    };
    *guard = static_tool;
}
