import {
  BoundaryElementProvider,
  Card,
  Code,
  DialogProvider,
  DialogProviderProps,
  Flex,
  Stack,
  Text,
  useElementRect,
} from '@sanity/ui'
import React, {memo, useMemo, useState} from 'react'
import styled from 'styled-components'
import {fromString as pathFromString} from '@sanity/util/paths'
import {Path} from '@sanity/types'
import {DocumentPaneNode} from '../../types'
import {PaneFooter} from '../../components/pane'
import {usePaneLayout} from '../../components/pane/usePaneLayout'
import {ErrorPane} from '../error'
import {LoadingPane} from '../loading'
import {ChangeConnectorRoot} from '../../../components/changeIndicators'
import {useZIndex} from '../../../components/zOffsets'
import {isDev} from '../../../environment'
import {useDocumentType, useTemplates} from '../../../hooks'
import {useSource, SourceProvider} from '../../../studio'
import {usePaneRouter, useDeskTool} from '../../components'
import {useTemplatePermissions} from '../../../datastores'
import {ReferenceInputOptionsProvider} from '../../../form'
import {ChangesPanel} from './changesPanel'
import {DocumentPanel} from './documentPanel'
import {DocumentOperationResults} from './DocumentOperationResults'
import {DocumentActionShortcuts} from './keyboardShortcuts'
import {DocumentStatusBar} from './statusBar'
import {useDocumentPane} from './useDocumentPane'
import {DocumentPaneProvider} from './DocumentPaneProvider'
import {DocumentPaneProviderProps} from './types'

type DocumentPaneOptions = DocumentPaneNode['options']

const DOCUMENT_PANEL_MIN_WIDTH = 320
const DOCUMENT_PANEL_INITIAL_MIN_WIDTH = 600
const CHANGES_PANEL_MIN_WIDTH = 320

const DIALOG_PROVIDER_POSITION: DialogProviderProps['position'] = [
  // We use the `position: fixed` for dialogs on narrow screens (< 512px).
  'fixed',
  // And we use the `position: absolute` strategy (within panes) on wide screens.
  'absolute',
]

const StyledChangeConnectorRoot = styled(ChangeConnectorRoot)`
  flex: 1;
  display: flex;
  min-height: 0;
  min-width: 0;
`

export const DocumentPane = memo(function DocumentPane(props: DocumentPaneProviderProps) {
  const {name: parentSourceName} = useSource()

  return (
    <SourceProvider name={props.pane.source || parentSourceName}>
      <DocumentPaneInner {...props} />
    </SourceProvider>
  )
})

function DocumentPaneInner(props: DocumentPaneProviderProps) {
  const {pane, paneKey} = props
  const {resolveNewDocumentOptions} = useSource().document
  const paneRouter = usePaneRouter()
  const options = usePaneOptions(pane.options, paneRouter.params)
  const {documentType, isLoaded: isDocumentLoaded} = useDocumentType(options.id, options.type)

  const templateItems = useMemo(() => {
    if (documentType) {
      return resolveNewDocumentOptions({
        type: 'document',
        documentId: options.id,
        schemaType: documentType,
      })
    }
    return []
  }, [documentType, options.id, resolveNewDocumentOptions])

  const [templatePermissions, isTemplatePermissionsLoading] = useTemplatePermissions({
    templateItems,
  })
  const isLoaded = isDocumentLoaded && !isTemplatePermissionsLoading

  const providerProps = useMemo(() => {
    return isLoaded && documentType && options.type !== documentType
      ? mergeDocumentType(props, options, documentType)
      : props
  }, [props, documentType, isLoaded, options])

  const {ReferenceChildLink, handleEditReference, groupIndex, routerPanesState} = paneRouter
  const childParams = routerPanesState[groupIndex + 1]?.[0].params || {}
  const routerPanesStateLength = routerPanesState.length
  const {parentRefPath} = childParams

  const activePath: {path: Path; state: 'selected' | 'pressed' | 'none'} = useMemo(() => {
    return parentRefPath
      ? {
          path: pathFromString(parentRefPath),
          state:
            // eslint-disable-next-line no-nested-ternary
            groupIndex >= routerPanesStateLength - 1
              ? 'none'
              : groupIndex >= routerPanesStateLength - 2
              ? 'selected'
              : 'pressed',
        }
      : {path: [], state: 'none'}
  }, [parentRefPath, groupIndex, routerPanesStateLength])

  if (options.type === '*' && !isLoaded) {
    return <LoadingPane flex={2.5} minWidth={320} paneKey={paneKey} title="Loading document…" />
  }

  if (!documentType) {
    return (
      <ErrorPane
        flex={2.5}
        minWidth={320}
        paneKey={paneKey}
        title={<>The document was not found</>}
      >
        <Stack space={4}>
          <Text as="p">
            The document type is not defined, and a document with the <code>{options.id}</code>{' '}
            identifier could not be found.
          </Text>
        </Stack>
      </ErrorPane>
    )
  }

  return (
    <DocumentPaneProvider {...providerProps}>
      {/* NOTE: this is a temporary location for this provider until we */}
      {/* stabilize the reference input options formally in the form builder */}
      {/* eslint-disable-next-line react/jsx-pascal-case */}
      <ReferenceInputOptionsProvider
        EditReferenceLinkComponent={ReferenceChildLink as any}
        onEditReference={handleEditReference as any}
        initialValueTemplateItems={templatePermissions}
        activePath={activePath}
      >
        <InnerDocumentPane />
      </ReferenceInputOptionsProvider>
    </DocumentPaneProvider>
  )
}

function usePaneOptions(
  options: DocumentPaneOptions,
  params: Record<string, string | undefined> = {}
): DocumentPaneOptions {
  const templates = useTemplates()

  return useMemo(() => {
    // The document type is provided, so return
    if (options.type && options.type !== '*') {
      return options
    }

    // Attempt to derive document type from the template configuration
    const templateName = options.template || params.template
    const template = templateName ? templates.find((t) => t.id === templateName) : undefined
    const documentType = template?.schemaType

    // No document type was found in a template
    if (!documentType) {
      return options
    }

    // The template provided the document type, so modify the pane’s `options` property
    return {...options, type: documentType}
  }, [options, params.template, templates])
}

function mergeDocumentType(
  props: DocumentPaneProviderProps,
  options: DocumentPaneOptions,
  documentType: string
): DocumentPaneProviderProps {
  return {
    ...props,
    pane: {
      ...props.pane,
      options: {...options, type: documentType},
    },
  }
}

function InnerDocumentPane() {
  const {
    changesOpen,
    documentSchema,
    documentType,
    onFocus,
    onHistoryOpen,
    onKeyUp,
    inspectOpen,
    paneKey,
    value,
  } = useDocumentPane()
  const {features} = useDeskTool()
  const {collapsed: layoutCollapsed} = usePaneLayout()
  const zOffsets = useZIndex()
  const [rootElement, setRootElement] = useState<HTMLDivElement | null>(null)
  const [footerElement, setFooterElement] = useState<HTMLDivElement | null>(null)
  const [actionsBoxElement, setActionsBoxElement] = useState<HTMLDivElement | null>(null)
  const footerRect = useElementRect(footerElement)
  const footerH = footerRect?.height

  const documentPanel = useMemo(
    () => (
      <DocumentPanel
        footerHeight={footerH || null}
        rootElement={rootElement}
        isInspectOpen={inspectOpen}
      />
    ),
    [footerH, rootElement, inspectOpen]
  )

  const footer = useMemo(
    () => (
      <PaneFooter ref={setFooterElement}>
        <DocumentStatusBar actionsBoxRef={setActionsBoxElement} />
      </PaneFooter>
    ),
    []
  )

  const changesPanel = useMemo(() => {
    if (!features.reviewChanges) return null
    if (!changesOpen) return null

    return (
      <BoundaryElementProvider element={rootElement}>
        <ChangesPanel />
      </BoundaryElementProvider>
    )
  }, [changesOpen, features.reviewChanges, rootElement])

  const children = useMemo(() => {
    if (!documentSchema) {
      return (
        <ErrorPane
          flex={2.5}
          minWidth={320}
          paneKey={paneKey}
          title={
            <>
              Unknown document type: <code>{documentType}</code>
            </>
          }
          tone="caution"
        >
          <Stack space={4}>
            {documentType && (
              <Text as="p">
                This document has the schema type <code>{documentType}</code>, which is not defined
                as a type in the local content studio schema.
              </Text>
            )}

            {!documentType && (
              <Text as="p">
                This document does not exist, and no schema type was specified for it.
              </Text>
            )}

            {isDev && value && (
              <>
                <Text as="p">Here is the JSON representation of the document:</Text>
                <Card padding={3} overflow="auto" radius={2} shadow={1} tone="inherit">
                  <Code language="json" size={[1, 1, 2]}>
                    {JSON.stringify(value, null, 2)}
                  </Code>
                </Card>
              </>
            )}
          </Stack>
        </ErrorPane>
      )
    }

    return (
      <>
        <DialogProvider position={DIALOG_PROVIDER_POSITION} zOffset={zOffsets.portal}>
          <Flex direction="column" flex={1} height={layoutCollapsed ? undefined : 'fill'}>
            <StyledChangeConnectorRoot
              data-testid="change-connector-root"
              isReviewChangesOpen={changesOpen}
              onOpenReviewChanges={onHistoryOpen}
              onSetFocus={onFocus}
            >
              {documentPanel}
              {changesPanel}
            </StyledChangeConnectorRoot>
          </Flex>
        </DialogProvider>
        {footer}
        <DocumentOperationResults />
      </>
    )
  }, [
    changesOpen,
    changesPanel,
    documentPanel,
    documentSchema,
    documentType,
    footer,
    onFocus,
    onHistoryOpen,
    layoutCollapsed,
    paneKey,
    value,
    zOffsets.portal,
  ])

  const currentMinWidth = changesOpen
    ? DOCUMENT_PANEL_INITIAL_MIN_WIDTH + CHANGES_PANEL_MIN_WIDTH
    : DOCUMENT_PANEL_INITIAL_MIN_WIDTH

  const minWidth = changesOpen
    ? DOCUMENT_PANEL_MIN_WIDTH + CHANGES_PANEL_MIN_WIDTH
    : DOCUMENT_PANEL_MIN_WIDTH

  return (
    <DocumentActionShortcuts
      actionsBoxElement={actionsBoxElement}
      currentMinWidth={currentMinWidth}
      data-testid="document-pane"
      flex={2.5}
      id={paneKey}
      minWidth={minWidth}
      onKeyUp={onKeyUp}
      rootRef={setRootElement}
    >
      {children}
    </DocumentActionShortcuts>
  )
}