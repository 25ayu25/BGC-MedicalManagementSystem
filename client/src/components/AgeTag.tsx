import React from 'react';

interface AgeTagProps {
  years?: number | string;
}

const AgeTag: React.FC<AgeTagProps> = ({ years }) => {
  const y = Number.isFinite(Number(years)) && Number(years) > 0 ? Math.floor(Number(years)) : 0;
  return <span>Age: {y} years</span>;
};

export default AgeTag;
