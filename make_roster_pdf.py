"""Write roster.pdf, a one-page printable unit reference (field-map stats).

Keep UNITS in sync with FIELD_STATS and UNIT_TYPES in engine.js. PDF strings must not contain
unbalanced parentheses or backslashes.
"""
from pathlib import Path

UNITS = [
    ("Command", "Move 0 | Range 1.5 | HP 5 | Damage 1 | Armor 1 | Size 2",
     "The command star. Lose it and the battle collapses."),
    ("Guard", "Move 4.5 | Range 1.5 | HP 3 | Damage 2 | Armor 1 | Size 1.4",
     "Frontline defender with extra health and armor."),
    ("Scout", "Move 9 | Range 1.5 | HP 2 | Damage 1 | Armor 0 | Size 0.9",
     "Fast recon unit that can move far and dart into weak points."),
    ("Lancer", "Move 6 | Range 5 | HP 2 | Damage 2 | Armor 0 | Size 1.1",
     "Long-range skirmisher that strikes from a distance."),
    ("Prism", "Move 3 | Range 8 | HP 2 | Damage 2 | Armor 0 | Size 1.2",
     "Beam artillery: needs a clear lane and ignores armor."),
    ("Nova", "Move 4.5 | Range 7 | HP 2 | Damage 1 | Blast 3.5 | Size 1.2",
     "Splash artillery: its blast also hits every enemy close to the target."),
    ("Orbiter", "Move 6 | Range 1.5 | HP 2 | Damage 1 | Field 4 | Size 0.8",
     "Small science vessel that projects a cloaking field over nearby allies."),
]

content_lines = [
    "BT /F1 24 Tf 72 760 Td (Doomstar Unit Guide) Tj ET",
    "BT /F1 11 Tf 72 736 Td (Field stats in fine tiles, 3 fine tiles = 1 original tile. Range is measured hull to hull.) Tj ET",
]
y = 700
for name, stats, text in UNITS:
    content_lines += [
        f"BT /F1 13 Tf 72 {y} Td ({name}) Tj ET",
        f"BT /F1 11 Tf 72 {y - 15} Td ({stats}) Tj ET",
        f"BT /F1 10 Tf 72 {y - 29} Td ({text}) Tj ET",
    ]
    y -= 58

content_stream = ("\n".join(content_lines) + "\n").encode("latin1")

objects = [
    (1, b"<< /Type /Catalog /Pages 2 0 R >>"),
    (2, b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    (3, b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>"),
    (4, b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"),
    (5, b"<< /Length " + str(len(content_stream)).encode("ascii") + b" >>\nstream\n" + content_stream + b"endstream"),
]

pdf = bytearray(b"%PDF-1.4\n")
offsets = [0]

for obj_num, obj_bytes in objects:
    offsets.append(len(pdf))
    pdf.extend(f"{obj_num} 0 obj\n".encode("latin1"))
    pdf.extend(obj_bytes)
    pdf.extend(b"\nendobj\n")

xref_start = len(pdf)
pdf.extend(f"xref\n0 {len(objects) + 1}\n".encode("latin1"))
pdf.extend(b"0000000000 65535 f \n")
for offset in offsets[1:]:
    pdf.extend(f"{offset:010d} 00000 n \n".encode("latin1"))

pdf.extend(
    f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_start}\n%%EOF\n".encode("latin1")
)

output_path = Path("roster.pdf")
output_path.write_bytes(pdf)
print(f"Created {output_path.resolve()}")
