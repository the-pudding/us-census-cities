import fs from "fs";
import * as d3 from "d3";
import stateLookup from "./state-abbr.js";

const lookupStateName = (abbr) => {
  const match = stateLookup.find((d) => d.abbr === abbr);
  return match?.state;
};

const COLUMN_POP = "POPESTIMATE2021";

const raw = d3.csvParse(fs.readFileSync("./input/sub-est2021_all.csv", "utf8"));
const places = d3
  .csvParse(fs.readFileSync("./input/POP_PLACES_20210825-reduced.csv", "utf8"))
  .map((d) => ({
    ...d,
    name: d.FEATURE_NAME.toLowerCase(),
  }));
const places2 = d3
  .csvParse(fs.readFileSync("./input/us2021census-coordinates.csv", "utf8"))
  .map((d) => ({
    ...d,
    name: d.City.toLowerCase(),
    state: lookupStateName(d.State),
  }));

const remove = ({ SUMLEV, NAME, FUNCSTAT, STNAME }) => {
  // remove state, county, conslidated city within city SUMLEV
  const deny = ["040", "050", "172"];
  if (FUNCSTAT !== "A") return false;
  if (deny.includes(SUMLEV)) return false;
  if (NAME.includes("(pt.)")) return false;
  if (NAME.includes("Balance of") || NAME.includes("(balance)")) return false;
  if (NAME.endsWith(" Reservation")) return false;
  if (NAME.includes(" government")) return false;
  if (NAME.startsWith("Township ")) return false;
  if (NAME.endsWith(" gore")) return false;
  if (NAME.endsWith(" location")) return false;
  if (NAME.endsWith(" urban county")) return false;
  if (NAME.endsWith(" corporation")) return false;
  if (NAME.endsWith(" village") && ["Vermont"].includes(STNAME)) return false;
  if (
    NAME.endsWith(" township") &&
    !["Michigan", "New Jersey", "Pennsylvania"].includes(STNAME)
  )
    return false;

  return true;
};

const refineName = ({ STATE, NAME }) => {
  let name = NAME;
  const ends = [
    "city and borough",
    "city",
    "metro township",
    "charter township",
    "charter",
    "township",
    "town",
    "village",
    "borough",
    "County",
    "UT",
    "plantation",
    "reservation",
    "Parish",
    "Borough",
    "municipality",
    "grant",
    "purchase",
    "CDP",
  ];
  const starts = ["Urban "];

  ends.forEach((end) => {
    const e = ` ${end}`;
    if (name.endsWith(e)) name = name.replace(e, "");
  });

  starts.forEach((start) => {
    if (start.startsWith(start)) name = name.replace(start, "");
  });

  // special cases
  if (name.endsWith(" Town") && STATE === "25")
    name = name.replace(" Town", "");

  return name;
};

const cleanCols = (d) => {
  const population = d[COLUMN_POP];
  const name = refineName(d);
  const id_pop = `${d.STATE}_${name}_${population}`;
  const id_county = `${d.STATE}_${name}_${d.COUNTY}`;
  // const id_state = `${d.STATE}_${name}`;
  // const id_county = `${d.STATE}_${d.COUNTY}_${name}`;
  // const id_place = `${d.STATE}_${d.PLACE}_${population}`;
  const o = {
    id_pop,
    id_county,
    name,
    population,
  };

  const keep = ["SUMLEV", "STATE", "COUNTY", "PLACE", "NAME", "STNAME"];
  keep.map((col) => (o[col] = d[col]));

  return o;
};

const clean = raw.filter(remove).map(cleanCols);
// console.table(clean);

// first check for id_pop matches, and store the possible id_county in an arry to check in round 2
const dedupedPop = d3
  .groups(clean, (d) => d.id_pop)
  .map((d) => {
    d[1].sort((a, b) => d3.descending(a.COUNTY, b.COUNTY));
    const winner = {
      ...d[1][0],
      countyIds: d[1].map((d) => d.id_county),
    };
    return winner;
  });

// console.log(dedupedPop);

const dedupedCounty = {};

dedupedPop.forEach((city) => {
  const { id_county } = city;
  const first = dedupedCounty[id_county] === undefined;
  if (first) {
    dedupedCounty[id_county] = city;
    const cityObj = dedupedCounty[id_county];
    // find best population (it will match on itself but that is fine since we are just grabbing population)
    const pops = dedupedPop
      .filter((d) => d.countyIds.includes(id_county))
      .map((d) => d.population);

    const max = Math.max(...pops);
    cityObj.population = max;
  }
});

const deduped = Object.values(dedupedCounty);

const nameMatch = (a, b) => {
  const al = a.toLowerCase().replace(/\./g, "");
  const bl = b.replace(/\./g, "");
  if (a.includes("St.")) return al === bl || al === bl.replace("saint ", "st ");
  return al === bl;
};

const coordinates = deduped.map((d) => {
  const match =
    places.find(
      (p) =>
        nameMatch(d.name, p.name) &&
        d.STATE === p.STATE_NUMERIC &&
        d.COUNTY === p.COUNTY_NUMERIC
    ) || {};

  // look for similar populations within 5% since not exact
  const match2 =
    places2.find(
      (p) =>
        nameMatch(d.name, p.name) &&
        d.STNAME === p.state &&
        Math.max(+d.population, +p.Population) /
          (Math.min(+d.population, +p.Population) < 1.05)
    ) || {};

  const lat1 = match.PRIM_LAT_DEC;
  const lng1 = match.PRIM_LONG_DEC;
  const lat2 = match2.Latitude;
  const lng2 = match2.Longitude;
  const diff =
    lat1 && lat2 ? Math.abs(lat1 - lat2) + Math.abs(lng1 - lng2) : undefined;
  const latitude = lat1 || lat2;
  const longitude = lng1 || lng2;

  return {
    ...d,
    latitude,
    longitude,
    lat1,
    lng1,
    lat2,
    lng2,
    diff,
  };
});

coordinates.forEach((c) => {
  delete c.countyIds;
  delete c.id_county;
  delete c.id_pop;
});

// // unique dedupedCounty
// const unique = [...new Set(dedupedCounty)];
// console.log(unique);

// 0 - ["36_Albion_000", "36_Albion_073"];
// 1 - [0]
// 2 - [];
// 3 - [];

// grab the first one of the grouping since they represent the same place to reduce duplicates
// const deduped = d3
//   .groups(clean, (d) => d.id)
//   .map((d) => {
//     d[1].sort((a, b) => d3.descending(a.population, b.population));
//     return d[1][0];
//   });

// console.log("row count:", d3.format(",")(clean.length));
// console.log("row count (deduped):", d3.format(",")(deduped.length));

fs.writeFileSync("./output/cities.csv", d3.csvFormat(coordinates));
fs.writeFileSync("./output/cities-undeduped.csv", d3.csvFormat(clean));
