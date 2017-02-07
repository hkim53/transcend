import React from 'react';
import '../../aframeComponents/scene-load';
import '../../aframeComponents/aframe-minecraft';
import AssetLoader from './AssetLoader';
import LoadingSpinner from './LoadingSpinner';

export default function App (props) {
  console.log('props ', props);
  return (
    // AssetLoader is a stateless component containing the a-assets for all of the React components
    //   rendered via props.children. It must reside here because A-Frame requires a-assets to a
    //   direct child of a-scene.
    <div style={{ width: '100%', height: '100%' }}>
      {!props.isLoaded ? (
        <LoadingSpinner/>
      )
      : null
      }
      <a-scene id="scene" scene-load>
        <AssetLoader />
        {props.children}
      </a-scene>
    </div>
  );
}
