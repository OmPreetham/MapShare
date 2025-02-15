"use client"

import { useEffect, useState, useRef } from "react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { Menu, Search } from "lucide-react"
import { Toggle } from "@/components/ui/toggle"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

const mapLayers = {
  standard: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  explore: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
}

export default function Map() {
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [currentLayer, setCurrentLayer] = useState("standard")
  const [showControls, setShowControls] = useState(false)
  const mapRef = useRef<L.Map | null>(null)
  const tileLayerRef = useRef<L.TileLayer | null>(null)
  const markersLayerRef = useRef<L.LayerGroup | null>(null)

  useEffect(() => {
    if (typeof window !== "undefined" && !mapRef.current) {
      const leaflet = L.map("map", {
        zoomControl: false,
      }).setView([51.505, -0.09], 13)
      tileLayerRef.current = L.tileLayer(mapLayers.standard, {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(leaflet)
      markersLayerRef.current = L.layerGroup().addTo(leaflet)
      mapRef.current = leaflet

      L.control
        .zoom({
          position: "bottomright",
        })
        .addTo(leaflet)

      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition((position) => {
          const { latitude, longitude } = position.coords
          leaflet.setView([latitude, longitude], 13)
        })
      }
    }
  }, [])

  const handleSearch = async () => {
    if (searchQuery.length > 2) {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`)
        if (!response.ok) {
          throw new Error("Failed to fetch search results")
        }
        const data = await response.json()
        setSearchResults(data)
        if (data.length > 0) {
          handleResultSelect(data[0])
        }
      } catch (error) {
        console.error("Error fetching search results:", error)
        setSearchResults([])
      }
    }
  }

  const handleResultSelect = (result: any) => {
    if (mapRef.current && markersLayerRef.current) {
      const lat = Number.parseFloat(result.lat)
      const lon = Number.parseFloat(result.lon)
      mapRef.current.setView([lat, lon], 13)

      markersLayerRef.current.clearLayers()

      const icon = L.divIcon({
        html: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-primary"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`,
        className: "custom-icon",
        iconSize: [24, 24],
        iconAnchor: [12, 24],
      })

      L.marker([lat, lon], { icon }).addTo(markersLayerRef.current)
    }
  }

  const changeMapLayer = (layer: "standard" | "satellite" | "explore") => {
    setCurrentLayer(layer)
    if (mapRef.current && tileLayerRef.current) {
      mapRef.current.removeLayer(tileLayerRef.current)
      tileLayerRef.current = L.tileLayer(mapLayers[layer], {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(mapRef.current)
    }
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <div id="map" className="absolute inset-0" />
      <div className="absolute top-4 left-4 z-[1000] w-80">
        <div className="bg-white/80 backdrop-blur-sm p-4 rounded-lg shadow-lg">
          <div className="flex space-x-2">
            <Input
              placeholder="Search for a place..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleSearch()}
            />
            <Button onClick={handleSearch}>
              <Search className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      <div className="absolute bottom-16 right-4 z-[1000] flex flex-col items-end space-y-2">
        <Toggle
          aria-label="Toggle map controls"
          pressed={showControls}
          onPressedChange={setShowControls}
          className="bg-white/80 backdrop-blur-sm shadow-lg"
        >
          <Menu className="h-4 w-4" />
        </Toggle>
        {showControls && (
          <div className="bg-white/80 backdrop-blur-sm p-4 rounded-lg shadow-lg">
            <ToggleGroup
              type="single"
              value={currentLayer}
              onValueChange={(value) => value && changeMapLayer(value as "standard" | "satellite" | "explore")}
            >
              <ToggleGroupItem value="standard" aria-label="Standard view">
                Map
              </ToggleGroupItem>
              <ToggleGroupItem value="satellite" aria-label="Satellite view">
                Satellite
              </ToggleGroupItem>
              <ToggleGroupItem value="explore" aria-label="Explore view">
                Explore
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        )}
      </div>
    </div>
  )
}

