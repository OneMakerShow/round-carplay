import { useEffect, useState } from "react";
import { HashRouter as Router, Route, Routes } from "react-router-dom";
import Settings from "./components/Settings";
import Info from "./components/Info";
import Home from "./components/Home";
import Nav from "./components/Nav";
import Carplay from './components/Carplay';
import Camera from './components/Camera';
import { Box, Modal } from '@mui/material';
import { useCarplayStore, useStatusStore } from "./store/store";
import type { KeyCommand } from "./components/worker/types";
import { updateCameras } from "./utils/cameraDetection";

const style = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  height: '95%',
  width: '95%',
  boxShadow: 24,
  display: "flex"
};

function App() {
  const [receivingVideo, setReceivingVideo] = useState(false);
  const [commandCounter, setCommandCounter] = useState(0);
  const [keyCommand, setKeyCommand] = useState('');

  const reverse = useStatusStore(state => state.reverse);
  const setReverse = useStatusStore(state => state.setReverse);

  const settings = useCarplayStore(state => state.settings);
  const saveSettings = useCarplayStore(state => state.saveSettings);
  const setCameraFound = useStatusStore(state => state.setCameraFound);

  useEffect(() => {
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [settings]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (!settings) return;

    if (Object.values(settings.bindings).includes(event.code)) {
      const action = Object.keys(settings.bindings).find(
        key => settings.bindings[key] === event.code
      );
      if (action !== undefined) {
        setKeyCommand(action);
        setCommandCounter(prev => prev + 1);
        if (action === 'selectDown') {
          setTimeout(() => {
            setKeyCommand('selectUp');
            setCommandCounter(prev => prev + 1);
          }, 200);
        }
      }
    }
  };

  useEffect(() => {
    if (!settings) return;

    updateCameras(setCameraFound, saveSettings, settings);

    const usbHandler = (_: any, data: { type: string }) => {
      if (['attach', 'plugged', 'detach', 'unplugged'].includes(data.type)) {
        updateCameras(setCameraFound, saveSettings, settings);
      }
    };

    window.carplay.usb.listenForEvents(usbHandler);
    return () => window.carplay.usb.unlistenForEvents?.(usbHandler);
  }, [settings]);

  return (
    <Router>
      {/* Schermo intero (kiosk) */}
      <div
        className="w-screen h-screen flex items-center justify-center bg-black"
        style={{ touchAction: 'none' }}
      >
        {/* Quadrato 800x800 centrato */}
        <div
          className="relative flex items-center justify-center"
          style={{
            width: "min(100vw, 100vh)",
            height: "min(100vw, 100vh)",
            borderRadius: "50%",
            overflow: "hidden",
            backgroundColor: "black",
            border: "0px solid red" // DEBUG: bordo cerchio esterno
          }}
        >

          {/* Quadrato 550x550 con tutta l'app centrata */}
          <div
            className="bg-black flex items-center justify-center"
            style={{
              width: "69%",
              height: "69%",
              transform: "translate(22%, 22%)",
              border: "0px solid lime" // DEBUG: bordo quadrato interno
            }}
          >
            <div className="w-full h-full flex items-center justify-center">
              <Nav receivingVideo={receivingVideo} settings={settings} />
              {settings && (
                <Carplay
                  receivingVideo={receivingVideo}
                  setReceivingVideo={setReceivingVideo}
                  settings={settings}
                  command={keyCommand as KeyCommand}
                  commandCounter={commandCounter}
                />
              )}
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/settings" element={<Settings settings={settings!} />} />
                <Route path="/info" element={<Info />} />
                <Route path="/camera" element={<Camera settings={settings!} />} />
              </Routes>
              <Modal open={reverse} onClick={() => setReverse(false)}>
                <Box sx={style}>
                  <Camera settings={settings} />
                </Box>
              </Modal>
            </div>
          </div>

          {/* Velocità in alto */}
          <div
            style={{
              position: "absolute",
              top: "3%",
              left: "50%",
              transform: "translateX(-50%)",
              fontSize: "72px",
              fontWeight: "bold",
              color: "white",
              textShadow: "0 0 10px rgba(0,0,0,0.7)",
            }}
          >
            000
            <span style={{ fontSize: "28px", marginLeft: "8px" }}>km/h</span>
          </div>
        </div>
      </div>
    </Router>
  );
}

export default App;
