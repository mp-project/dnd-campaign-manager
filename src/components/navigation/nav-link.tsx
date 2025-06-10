import React from 'react';

interface NavLinkProps {
  to: string;
  label: string;
}

const NavLink: React.FC<NavLinkProps> = ({ to, label }) => {
  return (
    <a href={to} className="nav-link ">
      {label}
    </a>
  );
};

export default NavLink;