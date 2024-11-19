// src/App.js


import React from 'react';
import { HashRouter as Router, Route, Routes } from 'react-router-dom';

import SearchBar from './search';
import './App.css';


function App() {
  return (
      <Router>
        <div className="App">
          <Routes>
            <Route path="/" element={<SearchBar />} />
            <Route path="/searchResult" element={<SearchBar />} />
            
          </Routes>
        </div>
      </Router>
  );
}


export default App;
