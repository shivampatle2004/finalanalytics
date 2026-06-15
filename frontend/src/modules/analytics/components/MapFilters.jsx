import React, { useState, useEffect } from 'react';
import mapService from '../services/mapService';

export const MapFilters = ({
  filters = {},
  onFilterChange,
  activeMeasure = 'sales'
}) => {
  const [countriesList, setCountriesList] = useState([]);
  const [statesList, setStatesList] = useState([]);
  const [citiesList, setCitiesList] = useState([]);
  const [categoriesList, setCategoriesList] = useState([]);

  // Fetch lists on load
  useEffect(() => {
    mapService.getCountries().then(setCountriesList).catch(console.error);
    mapService.getCategories().then(setCategoriesList).catch(console.error);
  }, []);

  // Update states whenever selected country changes
  useEffect(() => {
    mapService.getStates(filters.country || '').then(setStatesList).catch(console.error);
  }, [filters.country]);

  // Update cities whenever selected state changes
  useEffect(() => {
    mapService.getCities(filters.state || '', filters.country || '').then(setCitiesList).catch(console.error);
  }, [filters.state, filters.country]);

  const handleSelectChange = (key, value) => {
    onFilterChange({
      ...filters,
      [key]: value === 'all' ? '' : value
    });
  };

  const handleDateChange = (key, value) => {
    onFilterChange({
      ...filters,
      [key]: value
    });
  };

  const handleInputChange = (key, value) => {
    onFilterChange({
      ...filters,
      [key]: value === '' ? null : parseFloat(value)
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Date Selectors */}
      <div className="map-setting-group">
        <label className="map-setting-label" htmlFor="filter-date-start">Order Date Range</label>
        <div style={{ display: 'flex', gap: '4px' }}>
          <input
            id="filter-date-start"
            type="date"
            className="map-setting-control"
            value={filters.date_start || ''}
            onChange={(e) => handleDateChange('date_start', e.target.value)}
          />
          <input
            id="filter-date-end"
            type="date"
            className="map-setting-control"
            value={filters.date_end || ''}
            onChange={(e) => handleDateChange('date_end', e.target.value)}
          />
        </div>
      </div>

      {/* Country Selector */}
      <div className="map-setting-group">
        <label className="map-setting-label" htmlFor="filter-country">Country</label>
        <select
          id="filter-country"
          className="map-setting-control"
          value={filters.country || 'all'}
          onChange={(e) => handleSelectChange('country', e.target.value)}
        >
          <option value="all">All Countries</option>
          {countriesList.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* State Selector */}
      <div className="map-setting-group">
        <label className="map-setting-label" htmlFor="filter-state">State</label>
        <select
          id="filter-state"
          className="map-setting-control"
          value={filters.state || 'all'}
          onChange={(e) => handleSelectChange('state', e.target.value)}
          disabled={statesList.length === 0}
        >
          <option value="all">All States</option>
          {statesList.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* City Selector */}
      <div className="map-setting-group">
        <label className="map-setting-label" htmlFor="filter-city">City</label>
        <select
          id="filter-city"
          className="map-setting-control"
          value={filters.city || 'all'}
          onChange={(e) => handleSelectChange('city', e.target.value)}
          disabled={citiesList.length === 0}
        >
          <option value="all">All Cities</option>
          {citiesList.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Category Selector */}
      <div className="map-setting-group">
        <label className="map-setting-label" htmlFor="filter-category">Product Category</label>
        <select
          id="filter-category"
          className="map-setting-control"
          value={filters.category || 'all'}
          onChange={(e) => handleSelectChange('category', e.target.value)}
        >
          <option value="all">All Categories</option>
          {categoriesList.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Value Measure Bounds */}
      <div className="map-setting-group">
        <label className="map-setting-label" htmlFor="filter-min-val">Value Limits ({activeMeasure.toUpperCase()})</label>
        <div style={{ display: 'flex', gap: '4px' }}>
          <input
            id="filter-min-val"
            type="number"
            className="map-setting-control"
            placeholder="Min Value"
            value={filters.min_value ?? ''}
            onChange={(e) => handleInputChange('min_value', e.target.value)}
          />
          <input
            id="filter-max-val"
            type="number"
            className="map-setting-control"
            placeholder="Max Value"
            value={filters.max_value ?? ''}
            onChange={(e) => handleInputChange('max_value', e.target.value)}
          />
        </div>
      </div>
    </div>
  );
};

export default MapFilters;
