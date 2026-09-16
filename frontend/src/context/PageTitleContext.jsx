import { createContext, useContext, useEffect, useState } from 'react';

const PageTitleContext = createContext(null);

export function PageTitleProvider({ children }) {
  const [title, setTitle] = useState('');
  return <PageTitleContext.Provider value={{ title, setTitle }}>{children}</PageTitleContext.Provider>;
}

export function usePageTitleValue() {
  return useContext(PageTitleContext).title;
}

/** Call from a view to set the header title while it is mounted. */
export function usePageTitle(title) {
  const { setTitle } = useContext(PageTitleContext);
  useEffect(() => {
    setTitle(title);
  }, [title, setTitle]);
}
