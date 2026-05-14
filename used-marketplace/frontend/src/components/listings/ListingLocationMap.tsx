'use client';

import { useEffect, useRef } from 'react';
import type { LatLngExpression, Map as LeafletMap, Marker as LeafletMarker } from 'leaflet';
import styles from './ListingLocationMap.module.css';

type LeafletModule = typeof import('leaflet');

type Coordinates = {
  latitude: number;
  longitude: number;
};

interface ListingLocationMapProps {
  coordinates: Coordinates | null;
  locationLabel: string;
}

function createMarkerIcon(leaflet: LeafletModule) {
  return leaflet.divIcon({
    className: styles.markerIcon,
    iconSize: [30, 38],
    iconAnchor: [15, 34],
  });
}

export default function ListingLocationMap({
  coordinates,
  locationLabel,
}: ListingLocationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);

  useEffect(() => {
    if (!coordinates) {
      return;
    }

    const currentCoordinates = coordinates;
    let cancelled = false;
    let resizeTimer: number | null = null;

    async function initializeMap() {
      const leaflet = await import('leaflet');
      if (cancelled || !containerRef.current || mapRef.current) {
        return;
      }

      const latLng: LatLngExpression = [
        currentCoordinates.latitude,
        currentCoordinates.longitude,
      ];
      const map = leaflet
        .map(containerRef.current, {
          attributionControl: true,
          boxZoom: true,
          doubleClickZoom: true,
          dragging: true,
          keyboard: true,
          scrollWheelZoom: true,
          touchZoom: true,
          zoomControl: true,
        })
        .setView(latLng, 16);

      leaflet
        .tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors',
        })
        .addTo(map);

      markerRef.current = leaflet
        .marker(latLng, {
          icon: createMarkerIcon(leaflet),
          interactive: false,
        })
        .addTo(map);

      mapRef.current = map;
      resizeTimer = window.setTimeout(() => {
        if (!cancelled) {
          map.invalidateSize();
        }
      }, 0);
    }

    initializeMap();

    return () => {
      cancelled = true;
      if (resizeTimer !== null) {
        window.clearTimeout(resizeTimer);
      }

      markerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [coordinates]);

  return (
    <div className={styles.locationMapCard}>
      <div className={styles.mapHeader}>
        <span className={styles.mapEyebrow}>Origin Map</span>
        <strong>{locationLabel}</strong>
      </div>

      {coordinates ? (
        <div ref={containerRef} className={styles.mapCanvas} aria-label={`Map for ${locationLabel}`} />
      ) : (
        <div className={styles.mapFallback}>
          <div className={styles.fallbackPin} />
          <span>{locationLabel}</span>
        </div>
      )}
    </div>
  );
}
