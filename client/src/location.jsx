// Delivery location picker: GPS, place search, saved addresses, recent places and popular cities in one sheet.
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Briefcase, Building2, ChevronDown, Clock, Crosshair, Home, Loader2, MapPin, Navigation, Search, X } from "lucide-react";
import { useAuth } from "./AuthContext";
import api from "./api";

const POPULAR_CITIES = [
  ["Delhi", "Delhi", 28.6139, 77.209], ["Mumbai", "Maharashtra", 19.076, 72.8777], ["Bengaluru", "Karnataka", 12.9716, 77.5946],
  ["Hyderabad", "Telangana", 17.385, 78.4867], ["Chennai", "Tamil Nadu", 13.0827, 80.2707], ["Kolkata", "West Bengal", 22.5726, 88.3639],
  ["Pune", "Maharashtra", 18.5204, 73.8567], ["Gurugram", "Haryana", 28.4595, 77.0266], ["Noida", "Uttar Pradesh", 28.5355, 77.391], ["Faridabad", "Haryana", 28.4089, 77.3178]
];
const addressIcon = label => /work|office/i.test(label || "") ? Briefcase : /home/i.test(label || "") ? Home : Building2;

// OpenStreetMap's free geocoder, limited to India. Results become {area, city, state, postalCode, lat, lon}.
async function searchPlaces(query, signal) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.search = new URLSearchParams({ format: "jsonv2", addressdetails: "1", limit: "6", countrycodes: "in", q: query });
  const response = await fetch(url, { signal, headers: { "Accept-Language": navigator.language || "en" } });
  if (!response.ok) throw new Error("search failed");
  return (await response.json()).map(place => {
    const a = place.address || {};
    const city = a.city || a.town || a.village || a.city_district || a.county || a.state_district || "";
    const area = a.suburb || a.neighbourhood || a.quarter || a.residential || (place.name !== city ? place.name : "") || "";
    return { id: place.place_id, title: place.name || area || city, subtitle: place.display_name, area, city, state: a.state || "", postalCode: a.postcode || "", latitude: Number(place.lat), longitude: Number(place.lon) };
  }).filter(place => place.city);
}

export function LocationSheet({ open, onClose }) {
  const { user, location, locationStatus, locationError, requestLocation, saveManualLocation } = useAuth();
  const [query, setQuery] = useState(""), [results, setResults] = useState([]), [searching, setSearching] = useState(false), [searchError, setSearchError] = useState("");
  const [saved, setSaved] = useState([]), [recent, setRecent] = useState([]), [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState({ area: "", city: "", state: "", postalCode: "" }), [manualError, setManualError] = useState("");
  const inputRef = useRef(null);
  const locating = locationStatus === "loading" || locationStatus === "retrying";

  useEffect(() => {
    if (!open) return;
    setQuery(""); setResults([]); setSearchError(""); setManualError(""); setManualOpen(false);
    setManual({ area: location?.area || "", city: location?.city || "", state: location?.state || "", postalCode: location?.postalCode || "" });
    try { setRecent(JSON.parse(localStorage.getItem("gofoode_recent_locations") || "[]").filter(entry => entry?.label && entry.label !== location?.label).slice(0, 3)); } catch { setRecent([]); }
    if (user?.role === "customer") api.get("/addresses").then(response => setSaved(Array.isArray(response.data) ? response.data : [])).catch(() => setSaved([]));
    const focus = setTimeout(() => inputRef.current?.focus(), 60);
    const onKey = event => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { clearTimeout(focus); document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open]);

  // Search as the customer types, at most one request per pause in typing.
  useEffect(() => {
    const text = query.trim();
    if (text.length < 3) { setResults([]); setSearching(false); setSearchError(""); return; }
    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(() => {
      searchPlaces(text, controller.signal)
        .then(places => { setResults(places); setSearchError(places.length ? "" : "No places matched. Try an area, landmark or PIN code."); })
        .catch(error => { if (error.name !== "AbortError") setSearchError("Place search isn't available right now. Pick a city below or enter it manually."); })
        .finally(() => { if (!controller.signal.aborted) setSearching(false); });
    }, 450);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);

  if (!open) return null;
  const choose = place => { if (saveManualLocation(place)) onClose(); };
  const useGps = async () => { const result = await requestLocation(); if (result) onClose(); };
  const submitManual = event => {
    event.preventDefault();
    if (!manual.city.trim()) { setManualError("Enter a city to set your delivery location."); return; }
    if (saveManualLocation({ ...manual, source: "manual" })) onClose();
  };

  // Rendered into <body>: the sticky header uses backdrop-filter, which would otherwise trap a fixed overlay inside it.
  return createPortal(<div className="loc-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="loc-sheet" role="dialog" aria-modal="true" aria-labelledby="loc-title">
      <header className="loc-head">
        <div><h2 id="loc-title">Where should we deliver?</h2><p>{location?.label ? <>Currently: <b>{location.label}</b></> : "Set a location to see delivery times near you."}</p></div>
        <button type="button" className="loc-close" aria-label="Close" onClick={onClose}><X size={18}/></button>
      </header>

      <label className="loc-search"><Search size={18}/><input ref={inputRef} value={query} onChange={event => setQuery(event.target.value)} placeholder="Search area, street, landmark or PIN code" aria-label="Search for a delivery location" autoComplete="off"/>{searching ? <Loader2 size={17} className="tb-spin"/> : query && <button type="button" aria-label="Clear search" onClick={() => setQuery("")}><X size={15}/></button>}</label>

      <div className="loc-body">
        {query.trim().length >= 3 ? <div className="loc-group">
          {searchError && !searching && <p className="loc-note">{searchError}</p>}
          {results.map(place => <button type="button" className="loc-row" key={place.id} onClick={() => choose({ ...place, label: [place.area, place.city, place.state].filter((value, index, list) => value && list.indexOf(value) === index).join(", "), source: "search" })}>
            <span className="loc-row-icon"><MapPin size={17}/></span><span><b>{place.title}</b><small>{place.subtitle}</small></span>
          </button>)}
          {searching && !results.length && <p className="loc-note">Searching places…</p>}
        </div> : <>
          <button type="button" className="loc-gps" onClick={useGps} disabled={locating}>
            <span className="loc-gps-icon">{locating ? <Loader2 size={20} className="tb-spin"/> : <Crosshair size={20}/>}</span>
            <span><b>{locating ? "Finding your location…" : "Use my current location"}</b><small>Most accurate. We'll ask your browser for permission.</small></span>
            <Navigation size={16}/>
          </button>
          {locationError && <p className="loc-error" role="alert">{locationError}</p>}

          {saved.length > 0 && <div className="loc-group"><h3>Saved addresses</h3>
            {saved.map(address => { const Icon = addressIcon(address.label); return <button type="button" className="loc-row" key={address._id} onClick={() => choose({ area: address.street || "", city: address.city || "", state: address.state || "", postalCode: address.postalCode || "", latitude: address.location?.coordinates?.[1], longitude: address.location?.coordinates?.[0], label: [address.label, address.city].filter(Boolean).join(" · "), source: "saved" })}>
              <span className="loc-row-icon"><Icon size={17}/></span><span><b>{address.label || "Address"}{address.isDefault && <em>Default</em>}</b><small>{[address.street, address.city, address.state, address.postalCode].filter(Boolean).join(", ")}</small></span>
            </button>; })}
          </div>}

          {recent.length > 0 && <div className="loc-group"><h3>Recent</h3>
            {recent.map(place => <button type="button" className="loc-row" key={place.label} onClick={() => choose(place)}><span className="loc-row-icon"><Clock size={17}/></span><span><b>{place.label}</b><small>{place.postalCode ? `PIN ${place.postalCode}` : place.state || "Recently used"}</small></span></button>)}
          </div>}

          <div className="loc-group"><h3>Popular cities</h3>
            <div className="loc-cities">{POPULAR_CITIES.map(([city, state, latitude, longitude]) => <button type="button" key={city} className={location?.city === city ? "on" : ""} onClick={() => choose({ city, state, latitude, longitude, label: `${city}, ${state}`, source: "city" })}>{city}</button>)}</div>
          </div>

          <div className="loc-group">
            <button type="button" className="loc-manual-toggle" aria-expanded={manualOpen} onClick={() => setManualOpen(value => !value)}>Enter address manually <ChevronDown size={16}/></button>
            {manualOpen && <form className="loc-manual" onSubmit={submitManual}>
              <label>Area or street<input value={manual.area} onChange={event => setManual({ ...manual, area: event.target.value })} placeholder="Sector 15"/></label>
              <label>City<input value={manual.city} onChange={event => { setManual({ ...manual, city: event.target.value }); setManualError(""); }} placeholder="Faridabad"/></label>
              <div><label>State<input value={manual.state} onChange={event => setManual({ ...manual, state: event.target.value })} placeholder="Haryana"/></label><label>PIN code<input inputMode="numeric" maxLength={6} value={manual.postalCode} onChange={event => setManual({ ...manual, postalCode: event.target.value.replace(/\D/g, "") })} placeholder="121007"/></label></div>
              {manualError && <p className="loc-error" role="alert">{manualError}</p>}
              <button className="btn btn-primary">Save this location</button>
            </form>}
          </div>
        </>}
      </div>
      <footer className="loc-foot">Place search by <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a></footer>
    </section>
  </div>, document.body);
}
