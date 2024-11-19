import React from 'react';
import PropTypes from 'prop-types';
import './scroll-area.css';

const ScrollArea = ({ children }) => {
  return <div className="scroll-area">{children}</div>;
};

ScrollArea.propTypes = {
  children: PropTypes.node.isRequired,
};

// Named Export
export { ScrollArea };

