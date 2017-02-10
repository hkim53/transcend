import React from 'react';
import { joinChatRoom, leaveChatRoom } from '../../webRTC/client.js';
import Teleporter from './Teleporter';
import Room from './Room';
import Gif from 'aframe-gif-shader'; // causing problems

export default class Yoonah extends React.Component {

  componentDidMount () {
    joinChatRoom('yoonah');
  }

  componentWillUnmount () {
    leaveChatRoom();
  }

  render () {
    return (
      <a-entity>
        <Room floorWidth="50"
              floorHeight="50"
              wallHeight="25"
              wallColor="purple"
              floorColor=""
              floorTexture="#floorText"
              ceilingColor="#998403"/>
        <Teleporter x="-10" y="1" z="-1" color="green" href="/vr" />
        <Gif position="20 10 -10"/>
      </a-entity>
    );
  }
}
