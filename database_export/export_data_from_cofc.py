import os

# ✅ ใส่ทุกปีไว้ใน list
folder_paths = [
    r"Z:\Topnotch Group\Public\2024\C of C 2024",
    r"Z:\Topnotch Group\Public\2025\C of C 2025",
    r"Z:\Topnotch Group\Public\2026\C of C 2026",
]

lot_list = []

for folder_path in folder_paths:
    print(f"\n====================")
    print(f"📅 Processing YEAR folder: {folder_path}")

    customer_list = []

    # ✅ ดึง customer folder
    for file_name in os.listdir(folder_path):
        file_path = os.path.join(folder_path, file_name)

        if os.path.isdir(file_path):
            customer_list.append(file_name)

    customer_list = list(set(customer_list))

    # ✅ loop ลูกค้า
    for cus in customer_list:
        actual_folder_path = os.path.join(folder_path, cus, "Job completed")

        if not os.path.exists(actual_folder_path):
            print(f"❌ Missing folder: {actual_folder_path}")
            continue

        print(f"\n📂 {cus}")

        try:
            for file_name in os.listdir(actual_folder_path):
                file_path = os.path.join(actual_folder_path, file_name)

                if os.path.isfile(file_path):
                    # print(f"Processing file: {file_name}")

                    lot_list.append({
                        "year": folder_path.split("\\")[-2],  # ดึงปี
                        "customer": cus,
                        "file_name": file_name,
                        "path": file_path,
                        "lot": file_name.split(" ")[0],  # สมมติว่า Lot อยู่ก่อน _ ในชื่อไฟล์
                    })

        except Exception as e:
            print(f"❌ Error: {e}")

print(f"\n📊 Total lots processed: {len(lot_list)}")
print(f"Sample data:")
for lot in lot_list[:5]:  # Show first 5 lots
    print(f"  Lot: {lot['lot']}") 