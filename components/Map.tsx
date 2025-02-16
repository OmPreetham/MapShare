"use client"

import { useEffect, useState, useRef } from "react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { Menu, Search, ChevronLeft, ChevronRight, ExternalLink, Crosshair } from "lucide-react"
import { Toggle } from "@/components/ui/toggle"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"

const mapLayers = {
  standard: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  explore: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
}

interface WikiArticle {
  pageid: number
  title: string
  extract: string
  fullurl: string
  lat: number | null
  lon: number | null
  thumbnail?: {
    source: string
    width: number
    height: number
  }
}

export default function Map() {
  const [searchQuery, setSearchQuery] = useState("")
  const [currentLayer, setCurrentLayer] = useState("standard")
  const [showControls, setShowControls] = useState(false)
  const [wikiArticles, setWikiArticles] = useState<WikiArticle[]>([])
  const [currentArticleIndex, setCurrentArticleIndex] = useState(0)
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const tileLayerRef = useRef<L.TileLayer | null>(null)
  const markersLayerRef = useRef<L.LayerGroup | null>(null)
  const userMarkerRef = useRef<L.Marker | null>(null)

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
          setUserLocation([latitude, longitude])
          leaflet.setView([latitude, longitude], 13)
          fetchWikiArticles(latitude, longitude)
        })
      }

      leaflet.on("moveend", () => {
        const center = leaflet.getCenter()
        fetchWikiArticles(center.lat, center.lng)
      })
    }
  }, [])

  useEffect(() => {
    if (mapRef.current && userLocation) {
      if (userMarkerRef.current) {
        mapRef.current.removeLayer(userMarkerRef.current)
      }
      const icon = L.divIcon({
        html: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-blue-500"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>`,
        className: "custom-icon",
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      })
      userMarkerRef.current = L.marker(userLocation, { icon }).addTo(mapRef.current)
    }
  }, [userLocation])

  useEffect(() => {
    if (mapRef.current && markersLayerRef.current) {
      console.log("Updating markers:", wikiArticles.length)
      markersLayerRef.current.clearLayers()
      wikiArticles.forEach((article) => {
        if (typeof article.lat === "number" && typeof article.lon === "number") {
          const icon = L.divIcon({
            html: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-primary"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>`,
            className: "custom-icon",
            iconSize: [24, 24],
            iconAnchor: [12, 24],
          })
          const marker = L.marker([article.lat, article.lon], { icon }).addTo(markersLayerRef.current!)
          marker.bindPopup(createPopupContent(article))
          console.log("Added marker:", article.title, article.lat, article.lon)
        } else {
          console.warn("Invalid coordinates for article:", article.title)
        }
      })
    }
  }, [wikiArticles])

  const handleSearch = async () => {
    if (searchQuery.length > 2) {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`)
        if (!response.ok) {
          throw new Error("Failed to fetch search results")
        }
        const data = await response.json()
        if (data.length > 0) {
          handleResultSelect(data[0])
        }
      } catch (error) {
        console.error("Error fetching search results:", error)
      }
    }
  }

  const handleResultSelect = (result: any) => {
    if (mapRef.current) {
      const lat = Number.parseFloat(result.lat)
      const lon = Number.parseFloat(result.lon)
      mapRef.current.setView([lat, lon], 13)
      fetchWikiArticles(lat, lon)
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

  const fetchWikiArticles = async (lat: number, lon: number) => {
    try {
      const response = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gsradius=10000&gscoord=${lat}|${lon}&gslimit=50&format=json&origin=*`,
      )
      const data = await response.json()
      const pageIds = data.query.geosearch.map((item: any) => item.pageid).join("|")

      if (pageIds.length === 0) {
        setWikiArticles([])
        return
      }

      const articleResponse = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&pageids=${pageIds}&prop=extracts|pageimages|info|coordinates&exintro&explaintext&pithumbsize=100&inprop=url&format=json&origin=*`,
      )
      const articleData = await articleResponse.json()

      const articles: WikiArticle[] = Object.values(articleData.query.pages).map((page: any) => ({
        pageid: page.pageid,
        title: page.title,
        extract: page.extract,
        fullurl: page.fullurl,
        lat: page.coordinates ? page.coordinates[0].lat : null,
        lon: page.coordinates ? page.coordinates[0].lon : null,
        thumbnail: page.thumbnail,
      }))

      console.log("Fetched articles:", articles.length)
      setWikiArticles(articles.filter((article) => article.lat !== null && article.lon !== null))
    } catch (error) {
      console.error("Error fetching Wikipedia articles:", error)
      setWikiArticles([])
    }
  }

  const navigateArticle = (direction: "next" | "prev") => {
    if (direction === "next") {
      setCurrentArticleIndex((prevIndex) => (prevIndex + 1) % wikiArticles.length)
    } else {
      setCurrentArticleIndex((prevIndex) => (prevIndex - 1 + wikiArticles.length) % wikiArticles.length)
    }
  }

  const centerOnUserLocation = () => {
    if (mapRef.current && userLocation) {
      mapRef.current.setView(userLocation, 13)
    }
  }

  const createPopupContent = (article: WikiArticle) => {
    const popupContent = document.createElement("div")
    popupContent.className = "wiki-popup"
    popupContent.innerHTML = `
      <h3 class="text-lg font-semibold">${article.title}</h3>
      ${article.thumbnail ? `<img src="${article.thumbnail.source}" alt="${article.title}" class="w-full h-32 object-cover mb-2">` : ""}
      <p class="text-sm mb-2">${article.extract.slice(0, 100)}...</p>
      <a href="${article.fullurl}" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:underline">Read more</a>
    `
    return popupContent
  }

  useEffect(() => {
    const style = document.createElement("style")
    style.textContent = `
      .custom-icon svg {
        fill: hsl(var(--primary));
        filter: drop-shadow(0px 1px 2px rgba(0, 0, 0, 0.3));
      }
    `
    document.head.appendChild(style)
    return () => {
      document.head.removeChild(style)
    }
  }, [])

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
            <Button className="mt-2 w-full" onClick={centerOnUserLocation}>
              <Crosshair className="h-4 w-4 mr-2" />
              Center on Me
            </Button>
          </div>
        )}
      </div>
      <div className="absolute bottom-4 left-4 z-[1000] w-80">
        {wikiArticles.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>{wikiArticles[currentArticleIndex].title}</CardTitle>
              <CardDescription>
                Article {currentArticleIndex + 1} of {wikiArticles.length}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-start space-x-4">
                {wikiArticles[currentArticleIndex].thumbnail && (
                  <img
                    src={wikiArticles[currentArticleIndex].thumbnail.source || "/placeholder.svg"}
                    alt={wikiArticles[currentArticleIndex].title}
                    className="w-24 h-24 object-cover rounded"
                  />
                )}
                <p className="text-sm line-clamp-4">{wikiArticles[currentArticleIndex].extract}</p>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigateArticle("prev")}
                  disabled={wikiArticles.length <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigateArticle("next")}
                  disabled={wikiArticles.length <= 1}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <Button variant="outline" size="sm" asChild>
                <a href={wikiArticles[currentArticleIndex].fullurl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Read More
                </a>
              </Button>
            </CardFooter>
          </Card>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground">No articles found for this location.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

