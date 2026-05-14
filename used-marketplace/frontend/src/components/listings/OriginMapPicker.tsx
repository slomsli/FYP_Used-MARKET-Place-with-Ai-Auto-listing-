'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { LatLngExpression, Map as LeafletMap, Marker as LeafletMarker } from 'leaflet';
import styles from './OriginMapPicker.module.css';

type LeafletModule = typeof import('leaflet');

export type ListingCoordinates = {
  latitude: number;
  longitude: number;
};

interface OriginMapPickerProps {
  value: ListingCoordinates | null;
  disabled?: boolean;
  onChange: (coordinates: ListingCoordinates) => void;
}

const DEFAULT_CENTER: ListingCoordinates = {
  latitude: 4.2105,
  longitude: 101.9758,
};

function normalizeCoordinates(latitude: number, longitude: number): ListingCoordinates {
  return {
    latitude: Number(Math.max(-90, Math.min(90, latitude)).toFixed(6)),
    longitude: Number(Math.max(-180, Math.min(180, longitude)).toFixed(6)),
  };
}

function createMarkerIcon(leaflet: LeafletModule) {
  return leaflet.divIcon({
    className: styles.markerIcon,
    iconSize: [30, 38],
    iconAnchor: [15, 34],
  });
}

export default function OriginMapPicker({
  value,
  disabled = false,
  onChange,
}: OriginMapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<LeafletModule | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  const disabledRef = useRef(disabled);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const [isLocating, setIsLocating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    disabledRef.current = disabled;
    const marker = markerRef.current;
    if (!marker) {
      return;
    }

    if (disabled) {
      marker.dragging?.disable();
    } else {
      marker.dragging?.enable();
    }
  }, [disabled]);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const setMarkerPosition = useCallback((coordinates: ListingCoordinates, panMap: boolean) => {
    const leaflet = leafletRef.current;
    const map = mapRef.current;
    if (!leaflet || !map) {
      return;
    }

    const latLng: LatLngExpression = [coordinates.latitude, coordinates.longitude];
    if (!markerRef.current) {
      const marker = leaflet
        .marker(latLng, {
          draggable: !disabledRef.current,
          icon: createMarkerIcon(leaflet),
        })
        .addTo(map);

      marker.on('dragend', () => {
        const markerLatLng = marker.getLatLng();
        const nextCoordinates = normalizeCoordinates(markerLatLng.lat, markerLatLng.lng);
        onChangeRef.current(nextCoordinates);
        setMessage('Location pin updated.');
      });

      markerRef.current = marker;
    } else {
      markerRef.current.setLatLng(latLng);
    }

    if (panMap) {
      map.flyTo(latLng, Math.max(map.getZoom(), 15), { duration: 0.55 });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let resizeTimer: number | null = null;

    async function initializeMap() {
      const leaflet = await import('leaflet');
      if (cancelled || !containerRef.current || mapRef.current) {
        return;
      }

      const initialCoordinates = valueRef.current ?? DEFAULT_CENTER;
      const initialZoom = valueRef.current ? 15 : 6;
      const map = leaflet
        .map(containerRef.current, {
          attributionControl: true,
          scrollWheelZoom: true,
          zoomControl: false,
        })
        .setView([initialCoordinates.latitude, initialCoordinates.longitude], initialZoom);

      leaflet.control.zoom({ position: 'bottomright' }).addTo(map);
      leaflet
        .tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors',
        })
        .addTo(map);

      map.on('click', (event) => {
        if (disabledRef.current) {
          return;
        }

        const nextCoordinates = normalizeCoordinates(event.latlng.lat, event.latlng.lng);
        onChangeRef.current(nextCoordinates);
        setMarkerPosition(nextCoordinates, false);
        setMessage('Location pin updated.');
      });

      leafletRef.current = leaflet;
      mapRef.current = map;
      resizeTimer = window.setTimeout(() => {
        if (!cancelled) {
          map.invalidateSize();
        }
      }, 0);

      if (valueRef.current) {
        setMarkerPosition(valueRef.current, false);
      }
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
      leafletRef.current = null;
    };
  }, [setMarkerPosition]);

  useEffect(() => {
    if (!value) {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      return;
    }

    setMarkerPosition(value, false);
  }, [setMarkerPosition, value]);

  const handleUseCurrentLocation = useCallback(() => {
    if (disabled || isLocating) {
      return;
    }

    if (!navigator.geolocation) {
      setMessage('Your browser cannot detect location. You can still choose the state and area manually.');
      return;
    }

    setIsLocating(true);
    setMessage('Checking your current location...');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextCoordinates = normalizeCoordinates(
          position.coords.latitude,
          position.coords.longitude
        );

        onChangeRef.current(nextCoordinates);
        setMarkerPosition(nextCoordinates, true);
        setMessage('Current location pinned. You can fine-tune the marker on the map.');
        setIsLocating(false);
      },
      (error) => {
        const friendlyMessage =
          error.code === error.PERMISSION_DENIED
            ? 'No worries, location access was not allowed. You can still choose the state and area manually.'
            : 'We could not detect your location right now. You can still choose the state and area manually.';

        setMessage(friendlyMessage);
        setIsLocating(false);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 60000,
        timeout: 10000,
      }
    );
  }, [disabled, isLocating, setMarkerPosition]);

  const coordinatesLabel = value
    ? `${value.latitude.toFixed(5)}, ${value.longitude.toFixed(5)}`
    : 'No exact pin selected';

  return (
    <div className={styles.mapShell}>
      <div ref={containerRef} className={styles.mapCanvas} aria-label="Listing origin map" />
      <div className={styles.mapControls}>
        <button
          type="button"
          className={styles.locationButton}
          onClick={handleUseCurrentLocation}
          disabled={disabled || isLocating}
        >
          {isLocating ? 'Detecting...' : 'Use My Current Location'}
        </button>
        <span className={styles.coordinateBadge}>{coordinatesLabel}</span>
      </div>
      {message && <div className={styles.mapMessage}>{message}</div>}
    </div>
  );
}
