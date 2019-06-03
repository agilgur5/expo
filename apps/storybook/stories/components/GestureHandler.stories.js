import { storiesOf } from '@storybook/react-native';
import React from 'react';

import UIExplorer, { Description } from '../ui-explorer';
import notes from './GestureHandler.notes.md';

const TITLE = 'GestureHandler';

class DemoScreen extends React.Component {
  render() {
    return (
      <UIExplorer title={TITLE}>
        <Description>Desc</Description>
      </UIExplorer>
    );
  }
}

// storiesOf('Components', module).add(TITLE, () => <DemoScreen />, { notes });