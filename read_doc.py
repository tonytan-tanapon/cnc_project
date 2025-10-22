import re
import subprocess
import tempfile
from pathlib import Path

def convert_doc_to_text(doc_path):
    """Convert .doc to plain text using antiword or libreoffice."""
    # Try antiword first (fast and simple)
    try:
        result = subprocess.run(["antiword", doc_path], capture_output=True, text=True)
        if result.returncode == 0:
            return result.stdout
    except FileNotFoundError:
        pass  # antiword not installed

    # Fallback: use LibreOffice command-line conversion
    temp_dir = tempfile.gettempdir()
    temp_txt = Path(temp_dir) / (Path(doc_path).stem + ".txt")
    subprocess.run([
        "soffice", "--headless", "--convert-to", "txt:Text",
        "--outdir", temp_dir, doc_path
    ], check=True)
    return temp_txt.read_text(encoding="utf-8", errors="ignore")

def extract_operations_from_text(text):
    pattern = re.compile(r"(\d{3})\s+([A-Z ]+)\n(.*?)(?=\n\d{3}\s+|$)", re.DOTALL)
    matches = pattern.findall(text)

    operations = []
    for num, title, desc in matches:
        desc = re.sub(r"\n\s+", "\n", desc.strip())
        operations.append({
            "op_number": num.strip(),
            "title": title.strip(),
            "description": desc.strip()
        })
    return operations


# Example usage:
if __name__ == "__main__":
    doc_path = r"L17313.doc"  # your file
    text = convert_doc_to_text(doc_path)
    ops = extract_operations_from_text(text)
    for op in ops:
        print(f"OP {op['op_number']} - {op['title']}")
        print(op['description'])
        print("-" * 60)
