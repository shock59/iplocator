import { parseString } from "@fast-csv/parse";
import { countries, regions } from "./locations.js";
import https from "node:https";
import fetch from "node-fetch";
import { whoisIp } from "whoiser";

type WhoisData = Awaited<ReturnType<typeof whoisIp>>;
type GeofeedRow = {
  prefix: string;
  country: string;
  region: string;
  city: string;
};

export default async function apnic(ip: string) {
  const whoisResponse = await whoisIp(ip, { timeout: 10_000 });
  const geofeedUrl = findGeofeedUrl(whoisResponse);
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

function findGeofeedUrl(data: WhoisData): string | undefined {
  for (const key of Object.keys(data)) {
    if (
      typeof data[key] == "string" &&
      (key == "geofeed" ||
        (key == "Comment" && data[key].startsWith("Geofeed ")))
    ) {
      if (key == "geofeed") return data[key];
      else return data[key].slice(8);
    } else if (typeof data[key] == "object" && !Array.isArray(data[key])) {
      const response = findGeofeedUrl(data[key] as WhoisData);
      if (response != undefined) return response;
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
  const ipDelimeter = ip.includes(":") ? "" : ".";
  const splitIp = ip.split(ipDelimeter);
  if (splitIp.length - cut < 1) return;
  const checkString =
    splitIp.slice(0, splitIp.length - cut).join(ipDelimeter) +
    (ipDelimeter == "." && cut > 0
      ? `.${new Array(cut).fill("0").join(".")}`
      : "");
  const found = rows.find((row) => row.prefix.startsWith(checkString));
  if (found) return found;
  return findMatchingRow(ip, rows, cut + 1);
}
