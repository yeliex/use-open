# use-open
hooks for react component open state, and call with method

support antd, mui, shadcn/ui and any other react components

## Install
```bash
yarn add use-open
```

## Usage

```tsx
// page/index.tsx
const Page = () => {
    const opener = useOpen();

    return (
        <>
            <button onClick={() => opener.open()}>
                click
            </button>
            <Modal opener={opener} />
        </>
    );
};

// components/Modal.tsx
import { createPortal } from 'react-dom';
import { OpenInstance, useOpen, useOpenProps } from './index';

// component original props
interface IProps {

}

interface OpenProps {
    onConfirm: () => void;
}

const Modal = (props: IProps & {
    opener: OpenInstance<OpenProps>
}) => {
    const openProps = useOpenProps(props.opener);

    return createPortal((
        <AntModal
            open={openProps.opened}
        >
            modal
            <button
                onClick={() => openProps.onConfirm() && openProps.close()}
            >
                click
            </button>
        </AntModal>
    ), document.body);
};
```
