"""Writes data/songs/test/test.json: call-and-response test chart (Dad sings a pattern, then BF repeats it)."""
import json, os

BPM = 120
STEP = 60000 / BPM / 4  # ms per 16th
PATTERNS = [
    [(0, 2), (4, 1), (8, 3), (12, 2)],                                     # up down right up
    [(s, l) for s, l in zip(range(0, 16, 2), [0, 1, 2, 3, 0, 1, 2, 3])],   # eighths
    [(0, 0, 2), (4, 3, 2), (8, 2, 6)],                                     # holds
    [(s, l) for s, l in zip(range(8), [0, 1, 2, 3, 3, 2, 1, 0])] + [(8, 0), (10, 3), (12, 1), (14, 2)],  # stairs
    [(0, 0), (0, 3), (4, 1), (4, 2), (8, 0), (8, 2), (12, 1), (12, 3)],    # jumps
    [(s, 0 if s % 2 == 0 else 3) for s in range(12)] + [(12, 2, 3)],       # trill
    [(0, 2), (4, 1), (8, 3), (12, 2)],
]
sections = []
for pat in PATTERNS:
    for must_hit in (False, True):
        start = len(sections) * 16 * STEP
        notes = [[round(start + n[0] * STEP, 2), n[1], round(n[2] * STEP, 2) if len(n) > 2 else 0] for n in pat]
        sections.append({"lengthInSteps": 16, "mustHitSection": must_hit, "sectionNotes": notes})
sections.append({"lengthInSteps": 16, "mustHitSection": True, "sectionNotes": []})
song = {"song": {"song": "Test", "bpm": BPM, "speed": 2.2, "player1": "bf", "player2": "dad", "gfVersion": "gf",
                 "stage": "stage", "needsVoices": False, "notes": sections}}
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
path = os.path.join(root, "data", "songs", "test", "test.json")
os.makedirs(os.path.dirname(path), exist_ok=True)
with open(path, "w") as fh:
    json.dump(song, fh, indent=1)
print(sum(len(s["sectionNotes"]) for s in sections if s["mustHitSection"]), "player notes,", len(sections), "sections")
