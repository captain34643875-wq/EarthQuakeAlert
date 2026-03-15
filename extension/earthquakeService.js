/**
 * earthquakeService.js
 * 여러 기관의 지진 데이터를 수집하고 중복을 제거하는 서비스
 * - USGS (전 세계 지진)
 * - EMSC (유럽 및 지중해 지진)
 */

// 각 기관별 API 엔드포인트
const API_ENDPOINTS = {
  // USGS - 최근 1시간 전 세계 지진 (GeoJSON 형식)
  USGS: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson",
  
  // EMSC - 유럽 지진 데이터 (JSON 형식)
  EMSC: "https://www.seismicportal.eu/fdsnws/event/1/query?format=json&limit=20"
};

/**
 * 공통 지진 데이터 구조로 변환
 * @param {Object} rawData - 원본 지진 데이터
 * @param {string} source - 데이터 출처 (USGS, EMSC)
 * @returns {Object} 표준화된 지진 데이터
 */
function normalizeEarthquakeData(rawData, source) {
  try {
    switch (source) {
      case 'USGS':
        return normalizeUSGSData(rawData);
      case 'EMSC':
        return normalizeEMSCData(rawData);
      default:
        return null;
    }
  } catch (error) {
    console.error(`${source} 데이터 정규화 오류:`, error);
    return null;
  }
}

/**
 * USGS 데이터 정규화
 * USGS GeoJSON 형식을 공통 구조로 변환
 */
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
 * EMSC 데이터 정규화
 * EMSC JSON 형식을 공통 구조로 변환
 */
function normalizeEMSCData(data) {
  if (!data || !data.features || !Array.isArray(data.features)) {
    return [];
  }
  
  return data.features.map(feature => {
    const props = feature.properties || {};
    const geom = feature.geometry || {};
    const coords = geom.coordinates || [];
    
    // EMSC 데이터에서 위치 정보 추출 (다양한 필드 확인)
    const location = props.description || 
                    props.place || 
                    props.title || 
                    props.flynn_region ||
                    props.region ||
                    props.flynnRegion ||
                    props.text ||
                    props.label ||
                    'Unknown Location';
    
    // 디버깅을 위해 EMSC 데이터 구조 출력
    console.log('EMSC feature:', feature);
    console.log('EMSC props:', props);
    console.log('EMS props keys:', Object.keys(props));
    
    // EMSC ID 추출
    const emscId = props.id || 
                  props.eventid || 
                  props.unid || 
                  props.source_id || 
                  feature.id;
    
    console.log('EMSC ID found:', emscId);
    
    // EMSC URL 생성
    let url = props.url;
    if (!url && emscId) {
      // EMSC 상세 페이지 URL 형식
      url = `https://www.emsc-csem.org/Earthquake_information/earthquake.php?id=${emscId}`;
    }
    
    return {
      location: location,
      magnitude: props.mag || 0,
      depth: coords[2] || 0,
      time: new Date(props.time).toISOString(),
      source: 'EMSC',
      id: `EMSC_${feature.id || Date.now()}`,
      latitude: coords[1],
      longitude: coords[0],
      url: url
    };
  });
}

/**
 * 지진 데이터 중복 제거
 * 시간, 위치, 규모가 비슷하면 같은 이벤트로 처리
 * @param {Array} earthquakes - 지진 데이터 배열
 * @returns {Array} 중복이 제거된 지진 배열
 */
function removeDuplicateEarthquakes(earthquakes) {
  if (!earthquakes || earthquakes.length === 0) {
    return [];
  }

  // 데이터 소스 우선순위 (높을수록 우선)
  const sourcePriority = (source) => {
    const priorities = { 'USGS': 2, 'EMSC': 1 };
    return priorities[source] || 0;
  };

  const mergeEarthquakes = (preferred, fallback) => ({
    ...fallback,
    ...preferred,
    location: preferred.location || fallback.location,
    magnitude:
      typeof preferred.magnitude === "number"
        ? preferred.magnitude
        : fallback.magnitude,
    depth:
      typeof preferred.depth === "number" ? preferred.depth : fallback.depth,
    latitude:
      typeof preferred.latitude === "number"
        ? preferred.latitude
        : fallback.latitude,
    longitude:
      typeof preferred.longitude === "number"
        ? preferred.longitude
        : fallback.longitude,
    url: preferred.url || fallback.url,
    source: preferred.source || fallback.source
  });

  // 시간순으로 정렬
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

      // 중복 기준: 5분, 1도, 0.5 규모
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
 * 특정 기관에서 지진 데이터 가져오기
 * @param {string} source - 데이터 출처 (USGS, EMSC)
 * @returns {Promise<Array>} 정규화된 지진 데이터 배열
 */
async function fetchEarthquakeData(source) {
  try {
    const url = API_ENDPOINTS[source];
    if (!url) {
      throw new Error(`지원하지 않는 데이터 출처: ${source}`);
    }
    
    console.log(`${source} 지진 데이터 가져오는 중...`);
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`${source} API 요청 실패: ${response.status}`);
    }
    
    const data = await response.json();
    const normalized = normalizeEarthquakeData(data, source);
    console.log(`${source}에서 ${normalized.length}개 지진 데이터 가져옴`);
    return normalized;
    
  } catch (error) {
    console.error(`${source} 데이터 가져오기 실패:`, error);
    return [];
  }
}

/**
 * 모든 기관에서 지진 데이터 가져오기
 * @returns {Promise<Array>} 통합된 지진 데이터 배열
 */
async function fetchAllEarthquakeData() {
  try {
    // 모든 기관에서 병렬로 데이터 가져오기
    const sources = ['USGS', 'EMSC'];
    const promises = sources.map(source => fetchEarthquakeData(source));
    
    const results = await Promise.allSettled(promises);
    const allEarthquakes = [];
    
    results.forEach((result, index) => {
      const source = sources[index];
      if (result.status === 'fulfilled') {
        allEarthquakes.push(...result.value);
      } else {
        console.error(`${source} 데이터 가져오기 실패:`, result.reason);
      }
    });
    
    // 중복 제거
    const uniqueEarthquakes = removeDuplicateEarthquakes(allEarthquakes);
    
    // 최신순으로 정렬
    uniqueEarthquakes.sort((a, b) => 
      new Date(b.time) - new Date(a.time)
    );
    
    console.log(`총 ${uniqueEarthquakes.length}개의 고유한 지진 데이터 수집 완료`);
    return uniqueEarthquakes;
    
  } catch (error) {
    console.error('지진 데이터 수집 중 오류:', error);
    return [];
  }
}

/**
 * 최근 24시간 이내 지진만 필터링
 * @param {Array} earthquakes - 지진 데이터 배열
 * @returns {Array} 최근 지진 배열
 */
function filterRecentEarthquakes(earthquakes) {
  if (!earthquakes || earthquakes.length === 0) {
    return [];
  }
  
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  
  return earthquakes.filter(quake => {
    const quakeTime = new Date(quake.time);
    return quakeTime >= oneDayAgo;
  });
}

// 전역으로 내보내기 (Service Worker 환경)
self.EarthquakeService = {
  fetchAllEarthquakeData,
  fetchEarthquakeData,
  removeDuplicateEarthquakes,
  filterRecentEarthquakes,
  normalizeUSGSData,
  normalizeEMSCData
};
