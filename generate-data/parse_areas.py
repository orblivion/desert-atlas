import json

def parse_areas():
    """
    Parses areas.list created by mkgmap-splitter
    Returns {area_name: [[lat,lng], [lat,lng]]}
      (or maybe lng, lat is reversed, who knows. but it works.)
    """
    f = open('areas.list').readlines()
    for x in range(3):
        assert f[x][0] == '#'
    assert f[3][0] != '#'

    f = [l.strip() for l in f]

    areas = {}

    index = 3
    while index < len(f):
        assert f[index][0] != '#', f[index][0]
        assert f[index + 1][0] == '#', f[index + 1][0]
        assert f[index + 2] == '', f[index + 2]

        name = f[index].split(':')[0]
        bounds = f[index + 1].split(': ')[1].split(' to ')
        bounds = [([float(c) for c in coord.split(',')]) for coord in bounds]

        areas[name] = bounds

        index += 3

    return areas
