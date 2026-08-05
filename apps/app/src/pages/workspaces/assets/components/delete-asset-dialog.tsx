import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@arclayer/ui/alert-dialog";
import {
  AlertDialogAction as AlertDialogActionPrimitive,
  AlertDialogCancel as AlertDialogCancelPrimitive,
} from "@arclayer/ui/radix-primitives/radix-alert-dialog";
import { Button } from "@arclayer/ui/button";

export type DeleteAssetDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  confirmLoading?: boolean;
  title: string;
  description: string;
  cancelLabel: string;
  confirmLabel: string;
  confirmLoadingLabel: string;
  onConfirm: () => void;
};

export function DeleteAssetDialog(props: DeleteAssetDialogProps) {
  return (
    <AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{props.title}</AlertDialogTitle>
          <AlertDialogDescription>{props.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancelPrimitive asChild>
            <Button variant="outline" disabled={props.confirmLoading}>
              {props.cancelLabel}
            </Button>
          </AlertDialogCancelPrimitive>
          <AlertDialogActionPrimitive asChild>
            <Button variant="destructive" loading={props.confirmLoading} onClick={props.onConfirm}>
              {props.confirmLoading ? props.confirmLoadingLabel : props.confirmLabel}
            </Button>
          </AlertDialogActionPrimitive>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
