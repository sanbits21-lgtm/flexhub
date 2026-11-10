import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { MemberAuthProvider } from './MemberAuth';
import Shell from './Shell';
import Login from './pages/Login';
import Home from './pages/Home';
import Sessions from './pages/Sessions';
import Plans from './pages/Plans';
import Gym from './pages/Gym';
import Pass from './pages/Pass';
import Payments from './pages/Payments';
import Profile from './pages/Profile';
import Progress from './pages/Progress';

// The installable member app. It is a section of the same site (so one deployment, one login
// server) with its own manifest: opened from here, the browser offers to install THIS app,
// scoped to /member and named after the gym, instead of the staff website.
function useMemberManifest() {
  useEffect(() => {
    let link = document.querySelector('link[rel="manifest"]');
    const created = !link;
    if (!link) { link = document.createElement('link'); link.rel = 'manifest'; document.head.appendChild(link); }
    const previous = link.getAttribute('href');
    link.setAttribute('href', '/member.webmanifest');
    return () => {
      if (created) link.remove();
      else if (previous) link.setAttribute('href', previous);
    };
  }, []);
}

export default function MemberApp() {
  useMemberManifest();
  return (
    <MemberAuthProvider>
      <Routes>
        <Route path="login" element={<Login />} />
        <Route element={<Shell />}>
          <Route index element={<Home />} />
          <Route path="sessions" element={<Sessions />} />
          <Route path="workout" element={<Plans type="workout" />} />
          <Route path="diet" element={<Plans type="diet" />} />
          <Route path="gym" element={<Gym />} />
          <Route path="pass" element={<Pass />} />
          <Route path="progress" element={<Progress />} />
          <Route path="payments" element={<Payments />} />
          <Route path="profile" element={<Profile />} />
        </Route>
        <Route path="*" element={<Navigate to="/member" replace />} />
      </Routes>
    </MemberAuthProvider>
  );
}
