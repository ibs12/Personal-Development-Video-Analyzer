import React, { useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';

const searchResult = () => {
  const [searchTerm, setSearchTerm] = useState('');


  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="Search..."
        value={searchTerm}
        onChange={handleChange}
      />
      <button type="submit">Search
    
      </button>
    </form>
  );
};
export default searchResult;
