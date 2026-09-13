"""Write roster.pdf, a one-page printable unit reference.

Keep UNITS and DOOMSTAR in sync with UNIT_TYPES and DEFAULT_RULES in engine.js. PDF strings must not
contain unbalanced parentheses or backslashes.
"""
from pathlib import Path

DOOMSTAR = [
    "Charge: at the end of your turn, each star held by a Guard, Lancer, Prism or Nova adds 1 charge.",
    "Fire: at 3 charge, one of those ships inside the Doomstar fires instead of attacking: 5 damage to the enemy Command.",
    "Contest: an enemy ship at close range, Scouts included, stops a star from charging. Gunners can still fire.",
]

UNITS = [
    ("Command", "Move 0 | Range 1.5 | HP 15 | Damage 2 | Size 2",
     "Your command star. It cannot move. Lose it and you lose the battle."),
    ("Guard", "Move 4.5 | Range 1.5 | HP 9 | Damage 4 | Size 1.4",
     "Tough frontline brawler with the most hit points. Doomstar crew."),
    ("Scout", "Move 9 | Range 3 | HP 4 | Damage 2 | Size 0.9",
     "Fast raider that harasses from short range and contests enemy stars. Cannot charge or fire."),
    ("Lancer", "Move 6 | Range 5 | HP 4 | Damage 4 | Size 1.1",
     "Mid-range skirmisher that strikes from a distance. Doomstar crew."),
    ("Prism", "Move 4 | Range 8 | HP 4 | Damage 5 | Size 1.2",
     "Beam artillery with the heaviest hit. Doomstar crew."),
    ("Nova", "Move 7 | Range 10 | HP 4 | Damage 1 | Blast 3.5 | Size 1.2",
     "Fast, long-range splash harasser: a weak blast that hits every enemy close to the target. Doomstar crew."),
]

content_lines = [
    "BT /F1 24 Tf 72 760 Td (Doomstar Unit Guide) Tj ET",
    "BT /F1 11 Tf 72 736 Td (Distances in board tiles, 33 across. Range is measured hull to hull.) Tj ET",
    "BT /F1 14 Tf 72 706 Td (The Doomstar) Tj ET",
]
y = 690
for line in DOOMSTAR:
    content_lines.append(f"BT /F1 10 Tf 72 {y} Td ({line}) Tj ET")
    y -= 14
y -= 20
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

output_path = Path(__file__).resolve().with_name("roster.pdf")
output_path.write_bytes(pdf)
print(f"Created {output_path}")
