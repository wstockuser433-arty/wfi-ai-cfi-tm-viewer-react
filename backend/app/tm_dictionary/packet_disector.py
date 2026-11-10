import tkinter as tk
from tkinter import ttk, filedialog, messagebox
import csv
import yaml
import re
import math
import os

# ─── EBOX Decoder Logic (Standalone) ──────────────────────────────────
TYPES = {
    "u8": (">B", 1), "u16": (">H", 2), "u32": (">I", 4), "u64": (">Q", 8),
    "u24": (None, 3),
    "i8": (">b", 1), "i16": (">h", 2), "i32": (">i", 4), "i64": (">q", 8),
    "f32": (">f", 4), "f64": (">d", 8),
}

def apply_calc(calc_name, raw_val):
    # A simplified mock of the ebox_calcs.py logic for display purposes
    if raw_val is None: return None
    try:
        if calc_name == "TEMP_CHIP": return 326.85 - (raw_val / 4095) * 2500
        if calc_name == "CURRENT_2V5_SCALE": return 2.5 * ((raw_val / 4095 * 5) - 2.445)
        if calc_name == "TEMP_LTM8051": return (raw_val & 0x7FFF) * 0.1
        if calc_name == "TEMP_DDR": return raw_val * 0.0625
        if calc_name == "TEMP_M2S090": return raw_val * 0.0625
        if calc_name == "TEMP_CHANNEL": return raw_val / 128.0
        if calc_name == "TEMP_FPGA_MODULE": return raw_val / 128.0
        if calc_name == "V_5V_SCALE": return (raw_val / 4095) * 5
        if calc_name == "TEMP_NTC":
            R = 10 * (256 * raw_val) / (4095 - 256 * raw_val)
            if R <= 0: return None
            return 1/((1/298.15) + math.log(R/10)/4100) - 273.15
    except Exception:
        return None
    return None

def parse_yaml(yaml_path):
    with open(yaml_path, 'r') as f:
        data = yaml.safe_load(f)
    
    # We only care about the first card for this simple tool
    card_key = list(data['cards'].keys())[0]
    card = data['cards'][card_key]
    return card['fields']

def decode_packet(hex_str, yaml_fields, mode):
    hex_str = hex_str.strip().replace(" ", "").replace("\n", "")
    if not hex_str:
        raise ValueError("Input is empty.")
    
    try:
        raw = bytes.fromhex(hex_str)
    except ValueError:
        raise ValueError("Invalid hex string.")

    result = []

    if mode == "FULL":
        # Verify outer framing
        if raw[:4] != b'\x23\x23\x2A\x2A' or raw[-4:] != b'\x2A\x2A\x23\x23':
            raise ValueError("Invalid outer frame markers (23 23 2A 2A ... 2A 2A 23 23)")
        
        # Strip outer frame
        inner = raw[4:-4]
        
        # Parse headers (for display)
        word0 = int.from_bytes(inner[0:2], 'big')
        word1 = int.from_bytes(inner[2:4], 'big')
        word2 = int.from_bytes(inner[4:6], 'big')
        
        result.append(["Header", "Word 0 (Ver/Type/APID)", "", hex(word0), ""])
        result.append(["Header", "Word 1 (Seq)", "", hex(word1), ""])
        result.append(["Header", "Word 2 (Length)", "", hex(word2), ""])
        result.append(["Header", "Sub-header", "", hex(inner[6]), ""])
        result.append(["Header", "Unit ID", "", hex(inner[7]), ""])
        result.append(["Header", "Unit Sub ID", "", hex(inner[8]), ""])
        result.append(["Header", "Service", "", hex(inner[9]), ""])
        result.append(["Header", "Sub-service", "", hex(inner[10]), ""])
        
        # Payload starts at index 11 (6 main hdr + 1 sub hdr + 4 eff hdr)
        payload = inner[11:]
        checksum = inner[-1]
        
        result.append(["Checksum", "Additive Checksum", "", str(checksum), ""])
        
    elif mode == "PAYLOAD":
        payload = raw
    else:
        raise ValueError("Invalid mode.")

    result.append(["---", "--- PAYLOAD START ---", "", "", ""])

    for f in yaml_fields:
        name = f['name']
        offset = f['offset']
        typ = f['type']
        unit = f.get('unit', '')
        calc = f.get('calc')
        
        if typ not in TYPES:
            continue
            
        fmt, size = TYPES[typ]
        
        if offset + size > len(payload):
            continue
            
        if typ == "u24":
            b = payload[offset:offset+3]
            val = (b[0] << 16) | (b[1] << 8) | b[2]
        else:
            val = int.from_bytes(payload[offset:offset+size], 'big', signed=(typ.startswith('i')))
            
        raw_hex = payload[offset:offset+size].hex().upper()
        
        if calc:
            phys_val = apply_calc(calc, val)
            phys_str = f"{phys_val:.4f}" if phys_val is not None else "ERR"
            result.append(["Calc", name, str(val), raw_hex, f"{phys_str} {unit}".strip()])
        else:
            result.append(["Field", name, str(val), raw_hex, str(unit)])
            
    return result

# ─── Tkinter GUI ─────────────────────────────────────────────────────
class PacketDisectorApp:
    def __init__(self, root):
        self.root = root
        self.root.title("EBOX TM Packet Disector")
        self.root.geometry("1000x700")
        
        # Locate YAML
        self.yaml_path = "ebox.yaml"
        if not os.path.exists(self.yaml_path):
            # Fallback to likely path if run from repo root
            self.yaml_path = os.path.join("backend", "app", "tm_dictionary", "ebox.yaml")
            if not os.path.exists(self.yaml_path):
                messagebox.showerror("Error", "Could not find ebox.yaml. Please place this script next to ebox.yaml or run from backend directory.")
                root.destroy()
                return

        try:
            self.yaml_fields = parse_yaml(self.yaml_path)
        except Exception as e:
            messagebox.showerror("YAML Error", f"Failed to parse ebox.yaml: {e}")
            root.destroy()
            return

        self.decoded_data = []
        self.build_ui()

    def build_ui(self):
        # Top Frame: Input
        top_frame = ttk.Frame(self.root, padding=10)
        top_frame.pack(fill=tk.X)
        
        ttk.Label(top_frame, text="Raw Hex Data:").pack(anchor=tk.W)
        
        self.text_input = tk.Text(top_frame, height=5, font=("Courier", 10))
        self.text_input.pack(fill=tk.X, pady=(5, 10))
        self.text_input.insert("1.0", "23232A2A482BC04F00F3011A106801C50000004F4F4F4F4F738401900ABD09A0080F080F01DC0289027708580846085C085508DB079D08C308CF083C08C9089508FA082208B200000000000000000000000000001F00000E1A121C6666661D000000001E00000DB212EA000000000000000000000059F707FC59E207F859315B3C07FF5AB707DF000400000000004F000000000000000000000000000000000000000000000146BE000132DE00000034EBBB00000000000000000000000000000000000000000000000000004F004F000000000000000034E79E0000000000000000000000000000000000000000000000000000000000000000000000722A2A2323")
        
        controls_frame = ttk.Frame(top_frame)
        controls_frame.pack(fill=tk.X)
        
        self.mode_var = tk.StringVar(value="FULL")
        ttk.Checkbutton(controls_frame, text="Is this a Raw Payload only? (Uncheck for Full Wire Frame)", 
                        variable=self.mode_var, onvalue="PAYLOAD", offvalue="FULL").pack(side=tk.LEFT)
        
        ttk.Button(controls_frame, text="Decode Packet", command=self.process).pack(side=tk.RIGHT)
        ttk.Button(controls_frame, text="Export CSV", command=self.export_csv).pack(side=tk.RIGHT, padx=5)

        # Bottom Frame: Results Table
        bottom_frame = ttk.Frame(self.root, padding=10)
        bottom_frame.pack(fill=tk.BOTH, expand=True)
        
        columns = ("type", "name", "raw", "hex", "value")
        self.tree = ttk.Treeview(bottom_frame, columns=columns, show="headings")
        
        self.tree.heading("type", text="Type")
        self.tree.heading("name", text="Field Name")
        self.tree.heading("raw", text="Raw Int")
        self.tree.heading("hex", text="Hex")
        self.tree.heading("value", text="Value / Calc")
        
        self.tree.column("type", width=80, anchor=tk.CENTER)
        self.tree.column("name", width=250)
        self.tree.column("raw", width=80, anchor=tk.E)
        self.tree.column("hex", width=100, anchor=tk.CENTER)
        self.tree.column("value", width=250, anchor=tk.W)
        
        scrollbar = ttk.Scrollbar(bottom_frame, orient=tk.VERTICAL, command=self.tree.yview)
        self.tree.configure(yscroll=scrollbar.set)
        
        self.tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)

    def process(self):
        # Clear existing data
        for item in self.tree.get_children():
            self.tree.delete(item)
            
        hex_data = self.text_input.get("1.0", tk.END).strip()
        mode = self.mode_var.get()
        
        try:
            self.decoded_data = decode_packet(hex_data, self.yaml_fields, mode)
            
            for row in self.decoded_data:
                # Add tags for styling (e.g., headers in bold, calc in green)
                tag = ""
                if row[0] == "Header": tag = "header"
                elif row[0] == "Calc": tag = "calc"
                
                self.tree.insert("", tk.END, values=row, tags=(tag,))
                
            self.tree.tag_configure("header", background="#e0e0e0")
            self.tree.tag_configure("calc", foreground="#006600")
            
        except Exception as e:
            messagebox.showerror("Decoding Error", str(e))

    def export_csv(self):
        if not self.decoded_data:
            messagebox.showwarning("No Data", "Please decode a packet first.")
            return
            
        filepath = filedialog.asksaveasfilename(defaultextension=".csv", 
                                                filetypes=[("CSV Files", "*.csv")])
        if not filepath:
            return
            
        try:
            with open(filepath, 'w', newline='') as f:
                writer = csv.writer(f)
                writer.writerow(["Type", "Field Name", "Raw Value", "Hex", "Value/Calc"])
                writer.writerows(self.decoded_data)
            messagebox.showinfo("Success", f"Exported to {filepath}")
        except Exception as e:
            messagebox.showerror("Export Error", f"Failed to save: {e}")

if __name__ == "__main__":
    root = tk.Tk()
    app = PacketDisectorApp(root)
    root.mainloop()