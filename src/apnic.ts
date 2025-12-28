type WhoisEntry = { [key: string]: string | string[] | WhoisEntry[] };

export default async function apnic(ip: string) {
  const response = await fetch(
    `https://wq.apnic.net/query?searchtext=${encodeURIComponent(ip)}`
  );
  const json = await response.json();
  const geofeedUrl = findGeofeedUrl(json);
  return geofeedUrl;
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
