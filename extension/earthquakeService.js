﻿/**
 * earthquakeService.js
 * ?щ윭 湲곌???吏�吏??곗씠?곕? ?섏쭛?섍퀬 以묐났???쒓굅?섎뒗 ?쒕퉬?? * - USGS (???멸퀎 吏�吏?
 * - Korea Meteorological Administration (?쒓뎅 吏�吏?  
 * - Japan Meteorological Agency (?쇰낯 吏�吏?
 * - EMSC (?좊읇 諛?吏�以묓빐 吏�吏?
 */

// API endpoints
const ENABLE_EMSC = false;

const API_ENDPOINTS = {
  // USGS - 理쒓렐 1?쒓컙 ???멸퀎 吏�吏?(GeoJSON ?뺤떇)
  USGS: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson",
  
  // EMSC - ?좊읇 吏�吏??곗씠??(JSON ?뺤떇)
  EMSC: "https://www.seismicportal.eu/fdsnws/event/1/query?format=json&limit=20"
};

/**
 * 怨듯넻 吏�吏??곗씠??援ъ“濡?蹂�?? * @param {Object} rawData - ?먮낯 吏�吏??곗씠?? * @param {string} source - ?곗씠??異쒖쿂 (USGS, EMSC)
 * @returns {Object} ?쒖??붾맂 吏�吏??곗씠?? */
function normalizeEarthquakeData(rawData, source) {
  try {
    switch (source) {
      case 'USGS':
        return normalizeUSGSData(rawData);
      case 'EMSC':
        return ENABLE_EMSC ? normalizeEMSCData(rawData) : [];
      default:
        return null;
    }
  } catch (error) {
    console.error(`${source} ?곗씠???뺢퇋???ㅻ쪟:`, error);
    return null;
  }
}

/**
 * USGS ?곗씠???뺢퇋?? * USGS GeoJSON ?뺤떇??怨듯넻 援ъ“濡?蹂�?? */
function normalizeUSGSData(data) {
  if (!data.features || !Array.isArray(data.features)) {
    return [];
  }
  
  return data.features.map(feature => {
    const props = feature.properties || {};
    const geom = feature.geometry || {};
    const coords = geom.coordinates || [];
    
    return {
      location: props.place || 'Unknown Location',
      magnitude: props.mag || 0,
      depth: coords[2] || 0,
      time: new Date(props.time).toISOString(),
      source: 'USGS',
      id: `USGS_${feature.id}`,
      latitude: coords[1],
      longitude: coords[0],
      url: props.url
    };
  });
}

/**
 * EMSC ?곗씠???뺢퇋?? * EMSC JSON ?뺤떇??怨듯넻 援ъ“濡?蹂�?? */
function normalizeEMSCData(data) {
  if (!data || !data.features || !Array.isArray(data.features)) {
    return [];
  }
  
  return data.features.map(feature => {
    const props = feature.properties || {};
    const geom = feature.geometry || {};
    const coords = geom.coordinates || [];
    const latitude = coords[1];
    const longitude = coords[0];

    const hasLatLon =
      typeof latitude === "number" && typeof longitude === "number";

    const pickFirstNonEmpty = (...values) =>
      values.find((value) => typeof value === "string" && value.trim().length > 0);

    const location =
      pickFirstNonEmpty(
        props.description,
        props.place,
        props.title,
        props.flynn_region,
        props.region,
        props.flynnRegion
      ) ||
      (hasLatLon
        ? `?꾨룄 ${latitude.toFixed(2)}, 寃쎈룄 ${longitude.toFixed(2)}`
        : "Unknown Location");

    if (location === "Unknown Location") {
      console.debug("[EMSC] location fallback to Unknown", {
        id: feature.id,
        propsKeys: Object.keys(props),
        coords
      });
    }

    const emscId =
      props.id ||
      props.eventid ||
      props.unid ||
      props.source_id ||
      feature.id;

    const normalizeEmscUrl = (rawUrl, id) => {
      const cleanedUrl =
        typeof rawUrl === "string" && rawUrl.trim().length > 0
          ? rawUrl.replace(
              "/Earthquake_information/earthquake.php",
              "/Earthquake/earthquake.php"
            )
          : undefined;

      const hasSeismicPortalId =
        typeof id === "string" && id.includes("_");

      if (hasSeismicPortalId) {
        return `https://www.seismicportal.eu/fdsnws/event/1/query?format=eventtxt&eventid=${id}`;
      }

      if (cleanedUrl) {
        return cleanedUrl;
      }

      if (id) {
        return `https://www.emsc-csem.org/Earthquake/earthquake.php?id=${id}`;
      }

      return undefined;
    };

    const url = normalizeEmscUrl(props.url, emscId);
    
    return {
      location,
      magnitude: props.mag || 0,
      depth: coords[2] || 0,
      time: new Date(props.time).toISOString(),
      source: 'EMSC',
      id: `EMSC_${feature.id || Date.now()}`,
      latitude,
      longitude,
      url
    };
  });
}

/**
 * 吏�吏??곗씠??以묐났 ?쒓굅
 * ?쒓컙, ?꾩튂, 洹쒕え媛� 鍮꾩듂?섎㈃ 媛숈? ?대깽?몃줈 泥섎━
 * @param {Array} earthquakes - 吏�吏??곗씠??諛곗뿴
 * @returns {Array} 以묐났???쒓굅??吏�吏?諛곗뿴
 */
function removeDuplicateEarthquakes(earthquakes) {
  if (!earthquakes || earthquakes.length === 0) {
    return [];
  }

  const sourcePriority = (source) => {
    if (source === \"USGS\") return 2;
    if (source === \"EMSC\") return 1;
    return 0;
  };

  const mergeEarthquakes = (preferred, fallback) => ({
    ...fallback,
    ...preferred,
    location: preferred.location || fallback.location,
    magnitude:
      typeof preferred.magnitude === \"number\"
        ? preferred.magnitude
        : fallback.magnitude,
    depth:
      typeof preferred.depth === \"number\" ? preferred.depth : fallback.depth,
    latitude:
      typeof preferred.latitude === \"number\"
        ? preferred.latitude
        : fallback.latitude,
    longitude:
      typeof preferred.longitude === \"number\"
        ? preferred.longitude
        : fallback.longitude,
    url: preferred.url || fallback.url,
    source: preferred.source || fallback.source
  });

  // 시간순으로 정렬 (최신순)
  const sorted = [...earthquakes].sort((a, b) => 
    new Date(b.time) - new Date(a.time)
  );

  const unique = [];

  for (const earthquake of sorted) {
    const duplicateIndex = unique.findIndex(existing => {
      if (existing.id === earthquake.id) return true;

      const timeDiff = Math.abs(
        new Date(existing.time) - new Date(earthquake.time)
      ) / (1000 * 60); // 분 단위

      const latDiff = Math.abs(existing.latitude - earthquake.latitude);
      const lonDiff = Math.abs(existing.longitude - earthquake.longitude);
      const magDiff = Math.abs(existing.magnitude - earthquake.magnitude);

      // 중복 기준: 5분 이내, 1도 이내 위치, 0.5 이내 규모 차이
      return timeDiff <= 5 && latDiff <= 1 && lonDiff <= 1 && magDiff <= 0.5;
    });

    if (duplicateIndex === -1) {
      unique.push(earthquake);
      continue;
    }

    const existing = unique[duplicateIndex];
    const preferred =
      sourcePriority(earthquake.source) > sourcePriority(existing.source)
        ? mergeEarthquakes(earthquake, existing)
        : mergeEarthquakes(existing, earthquake);
    unique[duplicateIndex] = preferred;
  }

  return unique;
}
/**
 * ?뱀젙 湲곌???吏�吏??곗씠??媛�?몄삤湲? * @param {string} source - ?곗씠??異쒖쿂 (USGS, KMA, JMA, EMSC)
 * @returns {Promise<Array>} ?뺢퇋?붾맂 吏�吏??곗씠??諛곗뿴
 */
async function fetchEarthquakeData(source) {
  if (source === "EMSC" && !ENABLE_EMSC) {
    throw new Error('EMSC disabled');
  }

  try {
    const url = API_ENDPOINTS[source];
    if (!url) {
      throw new Error(`吏�?먮릺吏� ?딅뒗 ?곗씠??異쒖쿂: ${source}`);
    }
    
    console.log(`${source}?먯꽌 吏�吏??곗씠??媛�?몄삤??以?..`);
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`${source} API ?붿껌 ?ㅽ뙣: ${response.status}`);
    }
    
    const data = await response.json();
    const normalized = normalizeEarthquakeData(data, source);
    
    console.log(`${source}?먯꽌 ${normalized.length}媛?吏�吏??곗씠??媛�?몄샂`);
    return normalized;
    
  } catch (error) {
    console.error(`${source} ?곗씠??媛�?몄삤湲??ㅻ쪟:`, error);
    return [];
  }
}

/**
 * 紐⑤뱺 湲곌??먯꽌 吏�吏??곗씠??媛�?몄삤湲? * @returns {Promise<Array>} ?듯빀??吏�吏??곗씠??諛곗뿴
 */
async function fetchAllEarthquakeData() {
  try {
    // 紐⑤뱺 湲곌??먯꽌 蹂묐젹濡??곗씠??媛�?몄삤湲?    const sources = ['USGS'];
    const promises = sources.map(source => fetchEarthquakeData(source));
    
    const results = await Promise.allSettled(promises);
    const allEarthquakes = [];
    
    results.forEach((result, index) => {
      const source = sources[index];
      if (result.status === 'fulfilled') {
        allEarthquakes.push(...result.value);
      } else {
        console.error(`${source} ?곗씠??媛�?몄삤湲??ㅽ뙣:`, result.reason);
      }
    });
    
    // 以묐났 ?쒓굅
    const uniqueEarthquakes = removeDuplicateEarthquakes(allEarthquakes);
    
    // 理쒖떊?쒖쑝濡??뺣젹
    uniqueEarthquakes.sort((a, b) => 
      new Date(b.time) - new Date(a.time)
    );
    
    console.log(`珥?${uniqueEarthquakes.length}媛쒖쓽 怨좎쑀??吏�吏??곗씠???섏쭛 ?꾨즺`);
    return uniqueEarthquakes;
    
  } catch (error) {
    console.error('吏�吏??곗씠???섏쭛 以??ㅻ쪟:', error);
    return [];
  }
}

/**
 * 理쒓렐 吏�吏??곗씠?곕쭔 ?꾪꽣留?(理쒓렐 24?쒓컙)
 * @param {Array} earthquakes - 吏�吏??곗씠??諛곗뿴
 * @returns {Array} 理쒓렐 吏�吏??곗씠??諛곗뿴
 */
function filterRecentEarthquakes(earthquakes) {
  if (!earthquakes || earthquakes.length === 0) {
    return [];
  }
  
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  
  return earthquakes.filter(eq => 
    new Date(eq.time) >= oneDayAgo
  );
}

// ?꾩뿭?쇰줈 ?대낫?닿린
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    fetchAllEarthquakeData,
    fetchEarthquakeData,
    removeDuplicateEarthquakes,
    normalizeEarthquakeData,
    filterRecentEarthquakes
  };
} else if (typeof self !== 'undefined') {
  // Service Worker ?섍꼍
  self.EarthquakeService = {
    fetchAllEarthquakeData,
    fetchEarthquakeData,
    removeDuplicateEarthquakes,
    normalizeEarthquakeData,
    filterRecentEarthquakes
  };
} else {
  // ?쇰컲 釉뚮씪?곗? ?섍꼍
  window.EarthquakeService = {
    fetchAllEarthquakeData,
    fetchEarthquakeData,
    removeDuplicateEarthquakes,
    normalizeEarthquakeData,
    filterRecentEarthquakes
  };
}


