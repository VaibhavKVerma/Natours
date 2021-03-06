export const displayMap = (locations) => {
  mapboxgl.accessToken =
    'pk.eyJ1IjoidmFpYmhhdi12ZXJtYSIsImEiOiJjbDA2YmVrbGYwYnN3M2RyMmZleWc0Z3pnIn0.32mk8SOlP1tHmXmpNy4yyQ';
  const map = new mapboxgl.Map({
    container: 'map', // container ID
    style: 'mapbox://styles/vaibhav-verma/cl06cmzgf004e16p9714nfsbq', // style URL
    scrollZoom: false,
    // center: [-74.5, 40], // starting position [lng, lat]
    // zoom: 9, // starting zoom
    // interactive: false,
  });

  const bounds = new mapboxgl.LngLatBounds();

  locations.forEach((loc) => {
    //Create marker
    const el = document.createElement('div');
    el.className = 'marker';

    //Add marker
    new mapboxgl.Marker({
      element: el,
      anchor: 'bottom',
    })
      .setLngLat(loc.coordinates)
      .addTo(map);

    // Add popup
    new mapboxgl.Popup({
      offset: 30,
    })
      .setLngLat(loc.coordinates)
      .setHTML(`<p>Day ${loc.day}: ${loc.description}</p>`)
      .addTo(map);

    //Extends map bounds to include currrent location
    bounds.extend(loc.coordinates);
  });
  map.fitBounds(bounds, {
    padding: {
      top: 200,
      bottom: 150,
      left: 100,
      right: 100,
    },
  });
};
