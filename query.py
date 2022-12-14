import re
import unidecode

def query(q):
    # TODO Test cases? Even if we move to golang the test cases would be the same.
    # 
    # test 123
    # test "123 okay"
    # test "123 okay" then
    # "test 123"
    # "test 123" "okay then
    # "test 123" "okay then"
    # 
    # Probably a lot more too.
    res = q.split('"')

    tokens = []

    def add_quoted(t):
        nonlocal tokens
        stripped = t.strip()
        if stripped:
            tokens.append('"' + t.strip() + '"')

    def add_unquoted(ts):
        nonlocal tokens
        tokens += [
            '"' + t.strip() + '"*'
            for t in ts.split(' ')
            if len(t) > 1 # skip empty and one-char strings
        ]

    # Start range at 1 so that an even number of quotation markes leads to the
    # ValueError below. It just sort of works out that way with the split()
    # function. res[0] is unquoted no matter what so we just handle it first.
    add_unquoted(res[0])
    for idx in range(1, len(res), 2):
        try:
            quoted, unquoted = res[idx:idx+2]
            add_quoted(quoted)
            add_unquoted(unquoted)
        except ValueError:
            # If we missed the closing quotation mark somewhere, this gets triggered.
            # In this case we ignore the quote mark and treat everything as unquoted
            add_unquoted(res[idx])

    return ' '.join(tokens)

def search_normalize(s):
    s = unidecode.unidecode(s).lower().replace('-', ' ').replace('_', ' ')
    s = re.sub('[^0-9a-zA-Z "]+', '', s)
    return s

def search_normalize_save(s):
    return search_normalize(s).replace('"', ' ') # quotes don't get saved, we only want them for searching
