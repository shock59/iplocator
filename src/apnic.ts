import { parseString } from "@fast-csv/parse";
import { countries, regions } from "./locations.js";
import https from "node:https";
import fetch from "node-fetch";

type WhoisEntry = { [key: string]: string | string[] | WhoisEntry[] };
type GeofeedRow = {
  prefix: string;
  country: string;
  region: string;
  city: string;
};

export default async function apnic(ip: string) {
  const whoisResponse = await fetch(
    `https://wq.apnic.net/query?searchtext=${encodeURIComponent(ip)}`
  );
  const json = (await whoisResponse.json()) as WhoisEntry[];
  const geofeedUrl = findGeofeedUrl(json);
  if (!geofeedUrl) return;

  const agent = new https.Agent({ rejectUnauthorized: false });
  const geofeedResponse = await fetch(geofeedUrl, { agent });
  const rows = await parseGeofeed(await geofeedResponse.text());
  const match = findMatchingRow(ip, rows);
  if (!match) return;

  let processed: {
    country: string | undefined;
    countryCode: string;
    region: string | undefined;
    regionCode: string;
    city: string;
    location: string;
  } = {
    country: countries.find((c) => c.iso == match.country)?.name,
    countryCode: match.country,
    region: regions.find((r) => r.iso == match.region)?.name,
    regionCode: match.region,
    city: match.city,
    location: "",
  };
  processed.location = `${processed.city ? processed.city : ""}${
    processed.region ? `, ${processed.region}` : ""
  }${processed.country ? `, ${processed.country}` : ""}`;

  return processed;
}

function findGeofeedUrl(json: WhoisEntry[]): string | undefined {
  for (const entry of json) {
    for (const key of Object.keys(entry)) {
      if (key == "name" && entry[key] == "geofeed") {
        const values = entry["values"];
        if (
          !(
            Array.isArray(values) &&
            values.length >= 1 &&
            typeof values[0] == "string"
          )
        )
          continue;
        return values[0];
      } else if (typeof entry[key] == "object") {
        if (
          Array.isArray(entry[key]) &&
          entry[key].length >= 1 &&
          typeof entry[key][0] == "string"
        )
          continue;
        const response = findGeofeedUrl(
          Array.isArray(entry[key])
            ? (entry[key] as WhoisEntry[])
            : [entry[key]]
        );
        if (response != undefined) return response;
      }
    }
  }
}

function parseGeofeed(csv: string): Promise<GeofeedRow[]> {
  return new Promise((resolve) => {
    let rows: GeofeedRow[] = [];

    parseString(csv, {
      headers: ["prefix", "country", "region", "city"],
      discardUnmappedColumns: true,
    })
      .on("error", (error) => console.error(error))
      .on("data", (row) => {
        if (row.five) console.log(row.five);
        rows.push(row);
      })
      .on("end", () => resolve(rows));
  });
}

function findMatchingRow(ip: string, rows: GeofeedRow[], cut: number = 0) {
  const ipDelimeter = ip.includes(":") ? ":" : ".";
  const splitIp = ip.split(ipDelimeter);
  if (splitIp.length - cut < 1) return;
  const checkString = splitIp.slice(0, splitIp.length - cut).join(ipDelimeter);
  const found = rows.find((row) => row.prefix.startsWith(checkString));
  if (found) return found;
  return findMatchingRow(ip, rows, cut + 1);
}
