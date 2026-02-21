import os
import shutil



source_root = r"Z:\Topnotch Group\Public\Test 2026\Supplier Cert 2026"
dest_folder = r"Z:\Topnotch Group\Public\Test 2026\Cert"


os.makedirs(dest_folder, exist_ok=True)

for root, dirs, files in os.walk(source_root):
    folder_name = os.path.basename(root)

    for file in files:
        source_file = os.path.join(root, file)

        name, ext = os.path.splitext(file)
        new_name = f"{folder_name}_name_{name}{ext}"

        dest_file = os.path.join(dest_folder, new_name)

        shutil.copy2(source_file, dest_file)

print("Files copied and renamed!")

source_root = r"Z:\Topnotch Group\Public\Test 2026\Supplier PO 2026"
dest_folder = r"Z:\Topnotch Group\Public\Test 2026\PO"


os.makedirs(dest_folder, exist_ok=True)

for root, dirs, files in os.walk(source_root):
    folder_name = os.path.basename(root)

    for file in files:
        source_file = os.path.join(root, file)

        name, ext = os.path.splitext(file)
        new_name = f"{folder_name}_name_{name}{ext}"

        dest_file = os.path.join(dest_folder, new_name)

        shutil.copy2(source_file, dest_file)

print("Files copied and renamed!")