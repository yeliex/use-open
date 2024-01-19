import { useRef, useSyncExternalStore } from 'react';

export class OpenInstance<OpenProps = unknown> extends EventTarget {
    state: {
        opened: boolean;
        props: OpenProps;
    } = { opened: false, props: {} as OpenProps };

    subscribe = (callback: any) => {
        this.addEventListener('change', callback);

        return () => {
            this.removeEventListener('change', callback);
        };
    };

    getSnapshot = () => {
        return this.state;
    };

    getServerSnapshot = () => {
        return {
            opened: false,
            props: {} as OpenProps,
        };
    };

    private change = (data: typeof this.state) => {
        this.state = { ...data };
        this.dispatchEvent(new Event('change'));
    };

    open = (props: OpenProps) => {
        if (this.state.opened) {
            throw new Error('Modal opened, please close first');
        }
        this.change({ opened: true, props });
    };

    close = () => {
        this.change({ opened: false, props: {} as OpenProps });
    };
}

export const useOpen = <OpenProps = unknown>(instance?: OpenInstance<OpenProps>) => {
    const ref = useRef<OpenInstance<OpenProps>>();

    if (!ref.current) {
        if (instance) {
            ref.current = instance;
        } else {
            ref.current = new OpenInstance();
        }
    }

    return ref.current!;
};

export const useOpenProps = <OpenProps = unknown>(instance: OpenInstance<OpenProps>) => {
    const modal = useOpen(instance);

    const state = useSyncExternalStore(modal.subscribe, modal.getSnapshot, modal.getServerSnapshot);

    return {
        ...(state.props || {} as OpenProps),
        opened: state.opened,
        open: modal.open,
        close: modal.close,
    };
};
