/**
 * earthquakeService.js
 * Fetches and normalizes earthquake data (USGS only).
 */

const API_ENDPOINTS = {
  // USGS - recent global earthquakes (GeoJSON)
  USGS: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson"
};

// Normalize source data to common shape
function normalizeEarthquakeData(rawData, source) {
  if (source !== "USGS") return [];
  return normalizeUSGSData(rawData);
}

// Normalize USGS GeoJSON
function normalizeUSGSData(data) {
  if (!data.features || !Array.isArray(data.features)) {
    return [];
  }

  return data.features.map((feature) => {
    const props = feature.properties || {};
    const geom = feature.geometry || {};
    const coords = geom.coordinates || [];

    return {
      location: props.place || "Unknown Location",
      magnitude: props.mag || 0,
      depth: coords[2] || 0,
      time: new Date(props.time).toISOString(),
      source: "USGS",
      id: `USGS_${feature.id}`,
      latitude: coords[1],
      longitude: coords[0],
      url: props.url
    };
  });
}

// Remove duplicates (time/location/magnitude)
function removeDuplicateEarthquakes(earthquakes) {
  if (!earthquakes || earthquakes.length === 0) {
    return [];
  }

  const sorted = [...earthquakes].sort(
    (a, b) => new Date(b.time) - new Date(a.time)
  );

  const unique = [];

  for (const earthquake of sorted) {
    const isDuplicate = unique.some((existing) => {
      if (existing.id === earthquake.id) return true;

      const timeDiff = Math.abs(
        new Date(existing.time) - new Date(earthquake.time)
      ) / (1000 * 60);

      const latDiff = Math.abs(existing.latitude - earthquake.latitude);
      const lonDiff = Math.abs(existing.longitude - earthquake.longitude);
      const magDiff = Math.abs(existing.magnitude - earthquake.magnitude);

      return timeDiff <= 5 && latDiff <= 1 && lonDiff <= 1 && magDiff <= 0.5;
    });

    if (!isDuplicate) {
      unique.push(earthquake);
    }
  }

  return unique;
}

// Fetch from a source
async function fetchEarthquakeData(source) {
  try {
    const url = API_ENDPOINTS[source];
    if (!url) {
      throw new Error(`Unsupported data source: ${source}`);
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`${source} API request failed: ${response.status}`);
    }

    const data = await response.json();
    return normalizeEarthquakeData(data, source);
  } catch (error) {
    console.error(`${source} fetch failed:`, error);
    return [];
  }
}

// Fetch from all sources
async function fetchAllEarthquakeData() {
  try {
    const sources = ["USGS"];
    const promises = sources.map((source) => fetchEarthquakeData(source));

    const results = await Promise.allSettled(promises);
    const allEarthquakes = [];

    results.forEach((result, index) => {
      const source = sources[index];
      if (result.status === "fulfilled") {
        allEarthquakes.push(...result.value);
      } else {
        console.error(`${source} fetch failed:`, result.reason);
      }
    });

    const uniqueEarthquakes = removeDuplicateEarthquakes(allEarthquakes);
    uniqueEarthquakes.sort((a, b) => new Date(b.time) - new Date(a.time));
    return uniqueEarthquakes;
  } catch (error) {
    console.error("Earthquake fetch error:", error);
    return [];
  }
}

// Filter last 24h
function filterRecentEarthquakes(earthquakes) {
  if (!earthquakes || earthquakes.length === 0) {
    return [];
  }

  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  return earthquakes.filter((quake) => new Date(quake.time) >= oneDayAgo);
}

// Export
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    fetchAllEarthquakeData,
    fetchEarthquakeData,
    removeDuplicateEarthquakes,
    normalizeEarthquakeData,
    filterRecentEarthquakes
  };
} else if (typeof self !== "undefined") {
  self.EarthquakeService = {
    fetchAllEarthquakeData,
    fetchEarthquakeData,
    removeDuplicateEarthquakes,
    normalizeEarthquakeData,
    filterRecentEarthquakes
  };
} else {
  window.EarthquakeService = {
    fetchAllEarthquakeData,
    fetchEarthquakeData,
    removeDuplicateEarthquakes,
    normalizeEarthquakeData,
    filterRecentEarthquakes
  };
}
