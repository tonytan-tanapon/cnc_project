import os

input_file = "file_sheet_list.txt"      # your original text file
output_file = "file_sheet_list_clean.txt"  # new file after filtering

cleaned_lines = []

with open(input_file, "r", encoding="utf-8") as f:
    for line in f:
        line_strip = line.strip()
        if line_strip.startswith("(r"):  # only check lines with data
            try:
                # extract path and sheet name
                path_part, sheet_part = line_strip.split(",", 1)
                path = path_part.split('"')[1]
                sheet = sheet_part.split('"')[1]

                # get filename without .xlsm
                filename = os.path.splitext(os.path.basename(path))[0]
                

                # keep only if sheet == filename
                if sheet == filename:
                    cleaned_lines.append(line)
                    print(filename)
            except Exception:
                pass
        else:
            # keep other lines (like FILES = [ , ])
            cleaned_lines.append(line)

# write result to new file
with open(output_file, "w", encoding="utf-8") as f:
    f.writelines(cleaned_lines)

print(f"Cleaned list written to {output_file}")
