import csv, requests, zipfile, gzip, json
import csv_format
from io import BytesIO, StringIO, TextIOWrapper
from collections import defaultdict
from shapely.geometry import shape

# Turn geojsons and geonames city csv into our trimmed down csv format for later search import

# Make the normal reader act more like a dict reader using column names defined
# on their info page. See: http://download.geonames.org/export/dump/
# Just a personal preference
class Row():
    def __repr__(self):
        return repr(dict(zip(self.in_format, self.row)))

    def __init__(self, row):
        self.row = row

    def __getitem__(self, field):
        if field not in self.in_format:
            raise Exception("Invalid field name")
        return self.row[self.in_format.index(field)]

class CitiesRow(Row):
    in_format = [
        "geonameid",
        "name",
        "asciiname",
        "alternatenames",
        "latitude",
        "longitude",
        "feature_class",
        "feature_code",
        "country_code",
        "cc2",
        "admin1_code",
        "admin2_code",
        "admin3_code",
        "admin4_code",
        "population",
        "elevation",
        "dem",
        "timezone",
        "modification_date",
    ]

class Admin1Row(Row):
    in_format = ["code", "name", "name_ascii", "geonameid"]

admin1_csv_f = StringIO(requests.get("http://download.geonames.org/export/dump/admin1CodesASCII.txt").content.decode('utf-8'))
admin1_reader = csv.reader(admin1_csv_f, delimiter='\t')

admin1 = defaultdict(dict)
for row_ in admin1_reader:
    row = Admin1Row(row_)
    country_code, admin1_code = row['code'].split('.')
    assert row["name"] not in admin1[country_code].values(), "Duplicate admin1 within country: " + repr(row)
    admin1[country_code][admin1_code] = row["name"]

zip_data = BytesIO(requests.get("http://download.geonames.org/export/dump/cities15000.zip").content)
OUTFILE_PATH = "../base-map/places.gz"

with gzip.open(OUTFILE_PATH, "wt") as outfile:
    writer = csv.DictWriter(outfile, fieldnames=csv_format.fieldnames)

    with gzip.open("../base-map/countries.geojson.gz") as geojson_file:
        countries = json.load(geojson_file)
        for country in countries['features']:
            if country['geometry'] is None:
                print(country["properties"]["ADMIN"], " will not be searchable")
            else:
                c = shape(country['geometry']).centroid
                writer.writerow({"name": country["properties"]["ADMIN"], "lat": c.y, "lng": c.x})

    with gzip.open("../base-map/usa-states.geojson.gz") as geojson_file:
        usa_states = json.load(geojson_file)
        for state in usa_states['features']:
            s = shape(state['geometry']).centroid
            writer.writerow({"name": state["properties"]["name"] + ", US", "lat": s.y, "lng": s.x})

    with zipfile.ZipFile(zip_data, "r") as zf:
        csv_f = TextIOWrapper(zf.open("cities15000.txt", "r"), encoding='utf-8')
        reader = csv.reader(csv_f, delimiter='\t')
        cities = defaultdict(dict)


        # Make sure we have no countries where some cities have Admin1 codes
        # and and some do not. It would create an inconsistent experience
        # with two formats ("City, Admin1, CountryCode" vs "City, CountryCode")
        # especially if there are duplicate city names with different formats.
        #
        # Fortunately it's only in rare cases that this inconsistency happens.
        # I'll just name them here, and remove the admin1_code for those
        # countries. In theory, removing Admin1 could inadvertently create more
        # duplicates in the process. We'll confirm that we didn't do this.
        #
        # TODO - Assert that the admin1_problem_country_codes countries actually
        # have both formats. If not, we can remove it from the list.
        country_admin1_check = {}
        admin1_problem_country_codes = ["MR"]

        for row_ in reader:
            row = CitiesRow(row_)

            # Make sure all cities have a country code
            assert row["country_code"], "Oops, I guess some cities don't have a country: " + repr(row)

            admin1_code = row["admin1_code"]
            if admin1_code not in admin1[row["country_code"]]:
                print("admin1_code " + row["admin1_code"] + " not found for " + row["country_code"])
                admin1_code = ""
            if row["country_code"] in admin1_problem_country_codes:
                admin1_code = ""

            if admin1_code:
                # We have the admin1_code, include it in the name

                if country_admin1_check.get(row["country_code"]) == False:
                    raise Exception(row["country_code"] + " has some but not all cities without admin1_code")
                country_admin1_check[row["country_code"]] = True

                name = ", ".join([
                    row["name"],
                    admin1[row["country_code"]][admin1_code],
                    row["country_code"]
                ])
            else:
                # We don't have the admin1_code, don't include it in the name
                if country_admin1_check.get(row["country_code"]) == True:
                    raise Exception(row["country_code"] + " has some but not all cities without admin1_code")
                country_admin1_check[row["country_code"]] = False

                name = ", ".join([
                    row["name"],
                    row["country_code"]
                ])

            # On dupe, take the one of the highest population. This might omit
            # some high population cities, but if we include the one with even
            # higher population within the same admin1, I think people will
            # understand.
            if name not in cities or int(cities[name]["population"]) < int(row["population"]):
                cities[name] = {
                    "population": row["population"],
                    "latitude": row["latitude"],
                    "longitude": row["longitude"],
                }
            else:
                print("Dupe city/country/admin1_code: " + name + " populations " + row["population"] + " vs " + cities[name]["population"])
                assert row["country_code"] not in admin1_problem_country_codes, "We may have created a dupe by removing admin1_country code"

        for name, properties in cities.items():
            writer.writerow({"name": name, "lat": properties["latitude"], "lng": properties["longitude"]})
