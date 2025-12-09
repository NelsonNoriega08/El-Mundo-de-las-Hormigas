// mapa.js
// Renderiza un mapa mundial detallado y agrupa países por continente
// - muestra tooltip al pasar el ratón
// - clic para editar la descripción (prompt simple)
// - expone window.CONTINENT_DATA para edición desde consola

const svg = d3.select('#map');
const width = 1200, height = 600;
svg.attr('viewBox', `0 0 ${width} ${height}`);

// tooltip div
const info = document.getElementById('info');

// Proyección y path generator (Natural Earth)
const projection = d3.geoNaturalEarth1()
  .scale(200)             // ajustable
  .translate([width / 2, height / 2]);
const path = d3.geoPath().projection(projection);

// URL TopoJSON (world-atlas). Usa unpkg: countries topojson con propiedades.
// Si quieres usar local, descarga este archivo y apunta a la ruta local.
const TOPO_URL = 'C:\Users\gener\OneDrive\Documentos\Visual Studio Code\Web final\El-Mundo-de-las-Hormigas\countries-110m.json';

// Mapeo de nombres normalizados de continentes (orden de salida)
const CONTINENT_NAMES = ['Africa','Antarctica','Asia','Europe','North America','Oceania','South America'];

// Datos por defecto para cada continente (editable)
const datosPorDefecto = {
  "Africa":      { titulo: "África", descripcion: "Población aproximada: —\nSuperficie: — km²" },
  "Antarctica":  { titulo: "Antártida", descripcion: "Población: 0 (solo presencia temporal)\nSuperficie: — km²" },
  "Asia":        { titulo: "Asia", descripcion: "Población aproximada: —\nSuperficie: — km²" },
  "Europe":      { titulo: "Europa", descripcion: "Población aproximada: —\nSuperficie: — km²" },
  "North America": { titulo: "Norteamérica", descripcion: "Población aproximada: —\nSuperficie: — km²" },
  "Oceania":     { titulo: "Oceanía", descripcion: "Población aproximada: —\nSuperficie: — km²" },
  "South America": { titulo: "Sudamérica", descripcion: "Población aproximada: —\nSuperficie: — km²" }
};

async function loadAndRender() {
  try {
    const res = await fetch(TOPO_URL);
    if (!res.ok) throw new Error('No se pudo descargar TopoJSON desde CDN.');
    const topo = await res.json();

    // Some world-atlas TopoJSON sets provide 'countries' under objects.countries (or objects['countries'])
    // We will try common object names:
    const possibleObjNames = Object.keys(topo.objects);
    // prefer 'countries' or 'land' or first object
    let countriesObjName = possibleObjNames.includes('countries') ? 'countries'
                        : possibleObjNames.includes('land') ? 'land'
                        : possibleObjNames[0];

    // Convert to GeoJSON features
    const countries = topojson.feature(topo, topo.objects[countriesObjName]).features;

    // Check property key for continent: try multiple possibilities
    // We'll detect property keys by inspecting the first country
    const propKeys = countries.length ? Object.keys(countries[0].properties || {}) : [];
    const continentKeyCandidates = ['continent','CONTINENT','CONTINENT_','region_un', 'region', 'subregion', 'CONTINENT'] ;
    let continentKey = continentKeyCandidates.find(k => propKeys.includes(k));
    // If none found, try to detect a property that looks like continent names
    if (!continentKey) {
      for (const k of propKeys) {
        const sample = (countries[0].properties[k] || '').toString();
        if (sample && CONTINENT_NAMES.some(cn => sample.toLowerCase().includes(cn.split(' ')[0].toLowerCase()))) {
          continentKey = k;
          break;
        }
      }
    }

    // If still not found, fallback to a manual lookup by iso_a2/iso_a3 mapping (not provided here).
    if (!continentKey) {
      console.warn('No se detectó una propiedad de "continente" en las propiedades de países. Se intentará inferir por "region" o agrupar todo como "Earth".');
      // We'll fallback: try 'region' or create mapping to "World" — but better to continue and group by 'region' or unknown.
    }

    // Build a map: continentName => array of country geometries
    const groups = new Map();
    countries.forEach(f => {
      let cName = 'Unknown';
      if (continentKey && f.properties && f.properties[continentKey]) {
        cName = String(f.properties[continentKey]);
      } else {
        // try some fallback properties
        const p = f.properties || {};
        cName = p.continent || p.CONTINENT || p.region || p.REGION || p.region_un || 'Unknown';
      }
      // normalize some values (e.g., "Americas" -> "North America"/"South America")
      // We'll attempt to map common values to our 7 canonical names:
      cName = normalizeContinentName(cName);

      if (!groups.has(cName)) groups.set(cName, []);
      groups.get(cName).push(f);
    });

    // For each of the 7 continents, merge the geometries (topojson-client.merge requires TopoJSON geometries)
    // But we have GeoJSON features already. D3 can draw MultiPolygon from combining geometries:
    const continentFeatures = [];
    CONTINENT_NAMES.forEach(name => {
      const arr = groups.get(name) || [];
      // Merge coordinates into a single MultiPolygon by creating a FeatureCollection and using topojson.merge if we had topo objects.
      // For simplicity we will create a Feature with geometry equal to geometry collection of all polygons (MultiPolygon).
      const geom = mergeGeoJSONGeometries(arr);
      if (geom) {
        continentFeatures.push({ type: 'Feature', properties: { continent: name }, geometry: geom });
      }
    });

    // Draw continents
    svg.selectAll('path.cont-path').data(continentFeatures)
      .join('path')
      .attr('class', 'cont-path')
      .attr('d', d => path(d))
      .attr('id', d => `cont-${slugify(d.properties.continent)}`)
      .each(function(d) {
        // add event listeners via d3
        const el = d3.select(this);
        el.on('mouseenter', (event, dd) => {
          this.classList.add('continent-hover');
          showInfo(event, dd.properties.continent);
        });
        el.on('mousemove', (event, dd) => {
          showInfo(event, dd.properties.continent);
        });
        el.on('mouseleave', () => {
          this.classList.remove('continent-hover');
          hideInfo();
        });
        el.on('click', (event, dd) => {
          // prompt to edit description
          const key = dd.properties.continent;
          const current = window.CONTINENT_DATA[key].descripcion || '';
          const nuevo = prompt(`Editar descripción de ${window.CONTINENT_DATA[key].titulo}:`, current);
          if (nuevo !== null) {
            window.CONTINENT_DATA[key].descripcion = nuevo;
            showInfo(event, key); // refresh
          }
        });
      });

    // Expose data object globally for console editing
    window.CONTINENT_DATA = {};
    CONTINENT_NAMES.forEach(name => {
      window.CONTINENT_DATA[name] = datosPorDefecto[name] ? { ...datosPorDefecto[name] } : { titulo: name, descripcion: '' };
    });

    console.log('Mapa cargado. Datos editables disponibles en window.CONTINENT_DATA');

  } catch (err) {
    console.error('Error cargando TopoJSON o generando mapa:', err);
    // Fallback: notify user in DOM
    d3.select('#map-wrapper').append('div')
      .style('color','white')
      .style('padding','16px')
      .html('No se pudo cargar el mapa desde el CDN. Comprueba conexión o descarga manualmente el TopoJSON.');
  }
}

function showInfo(evt, continentName) {
  const d = window.CONTINENT_DATA && window.CONTINENT_DATA[continentName] ? window.CONTINENT_DATA[continentName] : { titulo: continentName, descripcion: '' };
  const lines = (d.descripcion || '').replace(/\n/g, '<br>');
  info.innerHTML = `<strong>${d.titulo}</strong><br>${lines}`;
  info.style.display = 'block';

  const gap = 12;
  const pageX = evt.pageX || (evt.clientX + window.scrollX);
  const pageY = evt.pageY || (evt.clientY + window.scrollY);

  let x = pageX + gap;
  let y = pageY + gap;
  // avoid overflow
  const rect = info.getBoundingClientRect();
  if (x + rect.width > window.innerWidth) x = pageX - rect.width - gap;
  if (y + rect.height > window.innerHeight) y = pageY - rect.height - gap;

  info.style.left = x + 'px';
  info.style.top = y + 'px';
}

function hideInfo() {
  info.style.display = 'none';
}

// Utility: normalize continent names to canonical set used above
function normalizeContinentName(raw) {
  if (!raw) return 'Unknown';
  const s = raw.toString().trim().toLowerCase();
  if (s.includes('africa')) return 'Africa';
  if (s.includes('antar')) return 'Antarctica';
  if (s.includes('asia')) return 'Asia';
  if (s.includes('europe')) return 'Europe';
  if (s.includes('north') || s.includes('n america') || s === 'americas' && s.includes('north')) return 'North America';
  if (s.includes('south') || s.includes('s america')) return 'South America';
  if (s.includes('oceania') || s.includes('austral')) return 'Oceania';
  // special cases often found in some datasets
  if (s === 'americas' || s === 'america' || s === 'both') {
    // we try to separate later; fallback to North America
    return 'North America';
  }
  // fallback: try match any continent by substring
  for (const n of CONTINENT_NAMES) {
    if (s.includes(n.split(' ')[0].toLowerCase())) return n;
  }
  return 'Unknown';
}

// Utility: slugify
function slugify(str) {
  return String(str).toLowerCase().replace(/\s+/g,'-').replace(/[^\w\-]/g,'');
}

// Merge many GeoJSON features into a single MultiPolygon geometry
function mergeGeoJSONGeometries(features) {
  if (!features || features.length === 0) return null;
  // If only one, return its geometry directly:
  if (features.length === 1) return features[0].geometry;

  // Collect polygons/multipolygons coordinates into a MultiPolygon
  const polygons = [];
  features.forEach(f => {
    const g = f.geometry;
    if (!g) return;
    if (g.type === 'Polygon') polygons.push(g.coordinates);
    else if (g.type === 'MultiPolygon') polygons.push(...g.coordinates);
    else if (g.type === 'GeometryCollection') {
      g.geometries.forEach(gg => {
        if (gg.type === 'Polygon') polygons.push(gg.coordinates);
        if (gg.type === 'MultiPolygon') polygons.push(...gg.coordinates);
      });
    }
  });
  // Build a MultiPolygon geometry
  return { type: 'MultiPolygon', coordinates: polygons };
}

// Lanzar procesado
loadAndRender();
