import fs from "fs";
import * as d3 from "d3";

const COLUMN_POP = "POPESTIMATE2021";

const raw = d3.csvParse(fs.readFileSync("./input/sub-est2021_all.csv", "utf8"));

const states = raw.filter((d) => d.SUMLEV === "040");

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
  // const id_county = `${d.STATE}_${d.COUNTY}_${name}`;
  // const id_place = `${d.STATE}_${d.PLACE}_${population}`;
  const id = id_pop;
  const o = {
    id,
    name,
    population,
  };

  const keep = ["SUMLEV", "STATE", "COUNTY", "NAME", "STNAME", "FUNCSTAT"];
  keep.map((col) => (o[col] = d[col]));

  return o;
};

const clean = raw.filter(remove).map(cleanCols);

// grab the first one of the grouping since they represent the same place to reduce duplicates
const deduped = d3
  .groups(clean, (d) => d.id)
  .map((d) => {
    d[1].sort((a, b) => d3.descending(a.population, b.population));
    return d[1][0];
  });

const sumCities = d3.sum(deduped, (d) => d.population);
const sumStates = d3.sum(states, (d) => +d[COLUMN_POP]);

console.log("row count:", d3.format(",")(deduped.length));
console.log("city pop: ", d3.format(",")(sumCities));
console.log("state pop:", d3.format(",")(sumStates));

fs.writeFileSync("./output/cities.csv", d3.csvFormat(deduped));
fs.writeFileSync("./output/cities-undeduped.csv", d3.csvFormat(clean));
