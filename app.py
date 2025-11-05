from flask import Flask, render_template, jsonify
import json
import re
import os, random

app = Flask(__name__)

def parse_sgf_moves(sgf_text, limit=5):
    # find all move tokens like ;B[bb] or ;W[dc]
    moves = re.findall(r';([BW])\[([a-z]{0,2})\]', sgf_text)
    
    result = []
    for i, (color, coord) in enumerate(moves[:limit]):
        if len(coord) == 2:
            # convert letters to numbers (a=0)
            x = ord(coord[0]) - ord('a')
            y = ord(coord[1]) - ord('a')
            result.append({
                "x": x,
                "y": y,
                "color": "black" if color == 'B' else "white",
                "move": i + 1
            })
    return result

@app.route('/')
def index():
    folder = 'games'
    files = [f for f in os.listdir(folder) if f.endswith('.sgf')]
    if not files:
        raise FileNotFoundError("No SGF files found in 'games' folder.")

    random_file = os.path.join(folder, random.choice(files))

    with open(random_file, 'r', encoding='utf-8') as f:
        sgf_data = f.read()

    stones = parse_sgf_moves(sgf_data, limit=5)
    return render_template('index.html', stones=json.dumps(stones))

if __name__ == '__main__':
    app.run(debug=True)
